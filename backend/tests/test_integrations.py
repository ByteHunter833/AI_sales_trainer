import asyncio
from contextlib import asynccontextmanager
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient
from google.genai import types
from pydantic import SecretStr
from starlette.websockets import WebSocketDisconnect

from app.database import TrainingSession, TranscriptMessage, iso_now
from app.schemas import CoachReport
from app.services.evaluator import evaluate_session, generate_report
from app.services.gemini_live import connect_live
from test_core import report_payload

ORIGIN = {"origin": "http://localhost:5173"}


def configure(app):
    app.state.settings.gemini_api_key = SecretStr("test-secret-never-real")
    app.state.settings.gemini_live_model = "configured-live-model"
    app.state.settings.gemini_evaluation_model = "configured-text-model"


def add_complete_transcript(app, session_id):
    with app.state.db() as db:
        session = db.get(TrainingSession, session_id)
        session.status = "completed"
        session.started_at = iso_now(); session.ended_at = iso_now()
        for index, (speaker, text) in enumerate([
            ("customer", "What does this software do for my business?"),
            ("salesperson", "Could you tell me how your team currently manages customer information and which part of the process takes the most time?"),
            ("customer", "We spend too much time entering data manually."),
            ("salesperson", "We can automate your workflow. For example, automatic follow up reminders can help your team avoid missed calls. Would a short demo tomorrow help?"),
        ]):
            session.messages.append(TranscriptMessage(sequence=index + 1, speaker=speaker, content=text))
        db.commit()
        return list(session.messages)


async def test_evaluation_uses_stored_transcript_and_persists_python_score(app, client):
    configure(app)
    session_id = client.post("/api/sessions", json={}).json()["id"]
    messages = add_complete_transcript(app, session_id)
    async def mock_generate(settings, session, transcript):
        assert [m.content for m in transcript] == [m.content for m in messages]
        return CoachReport.model_validate(report_payload(transcript[-1].id))
    app.state.report_generator = mock_generate
    await evaluate_session(app, session_id)
    result = client.get(f"/api/sessions/{session_id}").json()
    assert result["status"] == "evaluated" and result["overall_score"] == 76
    assert result["evaluation"]["strengths"][0]["turn_id"] == messages[-1].id
    assert client.get("/api/dashboard").json()["average_score"] == 76
    assert client.get(f"/api/sessions/{session_id}/evaluation").status_code == 200
    with TestClient(__import__('app.main', fromlist=['create_app']).create_app(app.state.settings)) as restarted:
        assert restarted.get(f"/api/sessions/{session_id}").json()["overall_score"] == 76


async def test_evaluation_failure_retry_and_fabrication_rejection(app, client):
    configure(app)
    session_id = client.post("/api/sessions", json={}).json()["id"]
    messages = add_complete_transcript(app, session_id)
    app.state.report_generator = AsyncMock(side_effect=RuntimeError("PRIVATE API DETAILS"))
    await evaluate_session(app, session_id)
    result = client.get(f"/api/sessions/{session_id}").json()
    assert result["status"] == "evaluation_error"
    assert "PRIVATE" not in result["error"]
    app.state.report_generator = AsyncMock(return_value=CoachReport.model_validate(report_payload("invented-turn")))
    await evaluate_session(app, session_id)
    assert client.get(f"/api/sessions/{session_id}").json()["evaluation"] is None
    app.state.report_generator = AsyncMock(return_value=CoachReport.model_validate(report_payload(messages[-1].id)))
    await evaluate_session(app, session_id)
    assert client.get(f"/api/sessions/{session_id}").json()["status"] == "evaluated"


async def test_insufficient_transcript_does_not_call_model(app, client):
    session_id = client.post("/api/sessions", json={}).json()["id"]
    with app.state.db() as db:
        session = db.get(TrainingSession, session_id); session.status = "completed"; db.commit()
    app.state.report_generator = AsyncMock()
    await evaluate_session(app, session_id)
    assert client.get(f"/api/sessions/{session_id}").json()["status"] == "insufficient_data"
    app.state.report_generator.assert_not_called()


async def test_google_text_sdk_request_and_validation(app, client, monkeypatch):
    configure(app)
    session_id = client.post("/api/sessions", json={}).json()["id"]
    messages = add_complete_transcript(app, session_id)
    fake = MagicMock()
    fake.aio.__aenter__ = AsyncMock(return_value=fake.aio)
    fake.aio.__aexit__ = AsyncMock(return_value=False)
    import json
    fake.aio.models.generate_content = AsyncMock(return_value=SimpleNamespace(text=json.dumps(report_payload(messages[-1].id))))
    monkeypatch.setattr("app.services.evaluator.genai.Client", lambda **kwargs: fake)
    with app.state.db() as db:
        result = await generate_report(app.state.settings, db.get(TrainingSession, session_id), messages)
    assert result.categories.overall() == 76
    kwargs = fake.aio.models.generate_content.call_args.kwargs
    assert kwargs["model"] == "configured-text-model"
    assert messages[-1].content in kwargs["contents"]
    assert kwargs["config"].response_schema is CoachReport
    fake.aio.__aexit__.assert_awaited_once()


async def test_google_live_sdk_configuration_and_cleanup(app, client, monkeypatch):
    configure(app)
    session_id = client.post("/api/sessions", json={}).json()["id"]
    fake = MagicMock()
    fake.aio.__aenter__ = AsyncMock(return_value=fake.aio)
    fake.aio.__aexit__ = AsyncMock(return_value=False)
    fake.aio.live.connect.return_value.__aenter__ = AsyncMock(return_value="live")
    fake.aio.live.connect.return_value.__aexit__ = AsyncMock(return_value=False)
    monkeypatch.setattr("app.services.gemini_live.genai.Client", lambda **kwargs: fake)
    with app.state.db() as db:
        async with connect_live(app.state.settings, db.get(TrainingSession, session_id)) as live:
            assert live == "live"
    kwargs = fake.aio.live.connect.call_args.kwargs
    assert kwargs["model"] == "configured-live-model"
    assert kwargs["config"].input_audio_transcription is not None
    assert kwargs["config"].output_audio_transcription is not None
    fake.aio.live.connect.return_value.__aexit__.assert_awaited_once()


class FakeLive:
    def __init__(self):
        self.queue = asyncio.Queue()
        self.closed = False
        self.audio_received = []

    async def send_realtime_input(self, **kwargs):
        if kwargs.get("text"):
            await self.queue.put(types.LiveServerMessage(server_content=types.LiveServerContent(
                output_transcription=types.Transcription(text="Why is this so expensive?"), turn_complete=True,
                model_turn=types.Content(parts=[types.Part(inline_data=types.Blob(data=b"\x00\x00" * 100, mime_type="audio/pcm;rate=24000"))]),
            )))
        if kwargs.get("audio"):
            self.audio_received.append(kwargs["audio"])
            await self.queue.put(types.LiveServerMessage(server_content=types.LiveServerContent(
                input_transcription=types.Transcription(text="What is your current workflow?"),
            )))
            await self.queue.put(types.LiveServerMessage(server_content=types.LiveServerContent(interrupted=True)))
            await self.queue.put(types.LiveServerMessage(server_content=types.LiveServerContent(
                output_transcription=types.Transcription(text="We use spreadsheets."), turn_complete=True,
            )))

    async def receive(self):
        while True:
            item = await self.queue.get()
            yield item
            if item.server_content.turn_complete:
                return


def install_fake(app):
    configure(app)
    fake = FakeLive()
    @asynccontextmanager
    async def connector(settings, session):
        try:
            yield fake
        finally:
            fake.closed = True
    app.state.live_connector = connector
    return fake


def test_websocket_missing_key_and_origin(client):
    session_id = client.post("/api/sessions", json={}).json()["id"]
    with client.websocket_connect(f"/ws/training/{session_id}", headers=ORIGIN) as ws:
        assert ws.receive_json()["type"] == "error"
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect(f"/ws/training/{session_id}", headers={"origin": "https://untrusted.example"}):
            pass


def test_websocket_streams_pcm_transcripts_interruptions_and_cleanup(app, client):
    fake = install_fake(app)
    session_id = client.post("/api/sessions", json={}).json()["id"]
    with client.websocket_connect(f"/ws/training/{session_id}", headers=ORIGIN) as ws:
        assert ws.receive_json()["type"] == "connected"
        assert ws.receive_json()["message"]["speaker"] == "customer"
        assert ws.receive_bytes() == b"\x00\x00" * 100
        assert ws.receive_json()["type"] == "turn_complete"
        ws.send_bytes(b"\x01\x00" * 1600)
        assert ws.receive_json()["message"]["speaker"] == "salesperson"
        assert ws.receive_json()["type"] == "interrupted"
        assert ws.receive_json()["message"]["content"] == "We use spreadsheets."
        assert ws.receive_json()["type"] == "turn_complete"
        ws.send_json({"type": "end"})
        assert ws.receive_json()["type"] == "ended"
    session = client.get(f"/api/sessions/{session_id}").json()
    assert len(session["messages"]) == 3
    assert fake.audio_received[0].mime_type == "audio/pcm;rate=16000"
    assert fake.closed and not app.state.live_sessions
    assert session["ended_at"] is not None


@pytest.mark.parametrize("bad", [b"odd", b"\x00\x00" * 9000, "not JSON", '{"type":"unknown"}', "[]"])
def test_invalid_websocket_packets_are_saved_without_stack_traces(app, client, bad):
    fake = install_fake(app)
    session_id = client.post("/api/sessions", json={}).json()["id"]
    with client.websocket_connect(f"/ws/training/{session_id}", headers=ORIGIN) as ws:
        ws.receive_json(); ws.receive_json(); ws.receive_bytes(); ws.receive_json()
        ws.send_bytes(bad) if isinstance(bad, bytes) else ws.send_text(bad)
        error = ws.receive_json()
        assert error["type"] == "error" and "Invalid" in error["message"]
        assert ws.receive_json()["type"] == "ended"
    assert client.get(f"/api/sessions/{session_id}").json()["status"] == "error"
    assert fake.closed and not app.state.live_sessions


def test_provider_failure_is_explicit_and_never_simulated(app, client):
    configure(app)
    @asynccontextmanager
    async def broken(*args):
        raise RuntimeError("PRIVATE API SECRET")
        yield
    app.state.live_connector = broken
    session_id = client.post("/api/sessions", json={}).json()["id"]
    with client.websocket_connect(f"/ws/training/{session_id}", headers=ORIGIN) as ws:
        error = ws.receive_json()
        assert error["type"] == "error" and "PRIVATE" not in error["message"]
        assert ws.receive_json()["type"] == "ended"
    detail = client.get(f"/api/sessions/{session_id}").json()
    assert detail["messages"] == [] and detail["overall_score"] is None


def test_concurrency_limit(app, client):
    install_fake(app)
    app.state.settings.max_concurrent_sessions = 1
    a = client.post("/api/sessions", json={}).json()["id"]
    b = client.post("/api/sessions", json={}).json()["id"]
    with client.websocket_connect(f"/ws/training/{a}", headers=ORIGIN) as first:
        assert first.receive_json()["type"] == "connected"
        with client.websocket_connect(f"/ws/training/{b}", headers=ORIGIN) as second:
            assert "busy" in second.receive_json()["message"]
