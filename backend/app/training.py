import asyncio
import json
import time
from contextlib import suppress
from datetime import datetime

from fastapi import WebSocket, WebSocketDisconnect
from google.genai import types

from app.database import TrainingSession, TranscriptMessage, iso_now, utcnow
from app.schemas import MessageOut
from app.services.evaluator import evaluate_session


def schedule_evaluation(app, session_id):
    task = asyncio.create_task(evaluate_session(app, session_id))
    app.state.tasks.add(task)
    task.add_done_callback(app.state.tasks.discard)


async def training_socket(ws: WebSocket, session_id: str):
    app = ws.app
    settings = app.state.settings
    if ws.headers.get("origin") not in settings.cors_origins:
        await ws.close(code=1008)
        return
    await ws.accept()

    async def fail(message, code=1008):
        await ws.send_json({"type": "error", "message": message})
        await ws.close(code=code)

    with app.state.db() as db:
        training = db.get(TrainingSession, session_id)
        if training is None:
            return await fail("Training session not found.")
        if training.status != "created" or session_id in app.state.live_sessions:
            return await fail("This session has already started. Create a new session.")
        if settings.missing_configuration:
            return await fail("Gemini is not configured. Set the API key and both model names on the backend.")
        if len(app.state.live_sessions) >= settings.max_concurrent_sessions:
            return await fail("All training slots are busy. Please try again shortly.", 1013)
        app.state.live_sessions.add(session_id)
        training.status = "connecting"
        db.commit()

    send_lock = asyncio.Lock()
    tasks = []
    reason = "interrupted"
    error = None
    graceful = False
    last_event = time.monotonic()
    pending = {}  # Speaker -> actual transcribed turn, reset at model turn boundaries.
    sequence = 0
    audio_bytes = 0
    drain_incomplete = False
    turn_complete = True

    async def send(payload):
        async with send_lock:
            if isinstance(payload, bytes):
                await ws.send_bytes(payload)
            else:
                await ws.send_json(payload)

    async def transcript(speaker, text):
        nonlocal sequence
        if not text:
            return
        with app.state.db() as db:
            message = db.get(TranscriptMessage, pending[speaker]) if speaker in pending else None
            if message is None:
                sequence += 1
                message = TranscriptMessage(session_id=session_id, sequence=sequence, speaker=speaker, content=text)
                db.add(message)
            else:
                message.content += text
            if len(message.content) > 20000 or sequence > 500:
                raise ValueError("Transcript limit reached")
            db.commit()
            pending[speaker] = message.id
            payload = MessageOut.model_validate(message).model_dump()
        await send({"type": "transcript", "message": payload})

    try:
        async with asyncio.timeout(settings.max_session_seconds + 20):
            async with app.state.live_connector(settings, training) as live:
                with app.state.db() as db:
                    training = db.get(TrainingSession, session_id)
                    training.status = "active"
                    training.started_at = iso_now()
                    db.commit()
                    started_at = training.started_at
                await send({"type": "connected", "input_sample_rate": 16000,
                            "output_sample_rate": 24000, "started_at": started_at,
                            "max_duration_seconds": settings.max_session_seconds})

                async def receive_client():
                    nonlocal audio_bytes, graceful, turn_complete
                    window_start = time.monotonic()
                    window_bytes = 0
                    while True:
                        packet = await ws.receive()
                        if packet["type"] == "websocket.disconnect":
                            raise WebSocketDisconnect()
                        if packet.get("bytes") is not None:
                            data = packet["bytes"]
                            if not data or len(data) > settings.max_audio_bytes or len(data) % 2:
                                raise ValueError("Invalid PCM frame")
                            now = time.monotonic()
                            if now - window_start >= 1:
                                window_start, window_bytes = now, 0
                            window_bytes += len(data)
                            if window_bytes > 96000:
                                raise ValueError("Audio rate limit exceeded")
                            audio_bytes += len(data)
                            await live.send_realtime_input(audio=types.Blob(data=data, mime_type="audio/pcm;rate=16000"))
                        else:
                            raw = packet.get("text", "")
                            if len(raw) > 1024:
                                raise ValueError("Control message too large")
                            control = json.loads(raw)
                            if not isinstance(control, dict):
                                raise ValueError("Invalid control message")
                            if control.get("type") == "end":
                                graceful = True
                                await live.send_realtime_input(audio_stream_end=True)
                                return
                            if control.get("type") == "audio_pause":
                                await live.send_realtime_input(audio_stream_end=True)
                            else:
                                raise ValueError("Unknown control message")

                async def receive_provider():
                    nonlocal last_event, turn_complete
                    while True:
                        async for response in live.receive():
                            last_event = time.monotonic()
                            if response.go_away:
                                raise RuntimeError("Provider session is ending")
                            content = response.server_content
                            if not content:
                                continue
                            if content.interrupted:
                                await send({"type": "interrupted"})
                                pending.pop("customer", None)
                            if content.input_transcription:
                                turn_complete = False
                                await transcript("salesperson", content.input_transcription.text)
                            if content.output_transcription:
                                turn_complete = False
                                await transcript("customer", content.output_transcription.text)
                            if content.model_turn:
                                turn_complete = False
                                for part in content.model_turn.parts or []:
                                    blob = part.inline_data
                                    if blob and blob.data and (blob.mime_type or "").startswith("audio/pcm"):
                                        await send(blob.data)
                            if content.turn_complete:
                                turn_complete = True
                                pending.clear()
                                await send({"type": "turn_complete"})
                        # SDK receive() yields one model turn, so listen again.
                        await asyncio.sleep(0)

                receiver = asyncio.create_task(receive_provider())
                sender = asyncio.create_task(receive_client())
                timer = asyncio.create_task(asyncio.sleep(settings.max_session_seconds))
                tasks = [receiver, sender, timer]
                await live.send_realtime_input(text="Begin the sales practice now with your customer opening in the configured language.")
                done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
                if receiver in done:
                    await receiver
                    raise RuntimeError("Provider connection closed")
                if sender in done:
                    await sender
                elif timer in done:
                    graceful = True
                    await send({"type": "ending", "message": "Practice time limit reached. Saving your conversation."})
                    sender.cancel()
                    await live.send_realtime_input(audio_stream_end=True)
                # Drain final transcription events before closing the provider.
                drain_started = time.monotonic()
                while time.monotonic() - drain_started < 7:
                    if receiver.done():
                        await receiver
                    elapsed = time.monotonic() - drain_started
                    if elapsed >= 1.5 and time.monotonic() - last_event >= 1 and turn_complete:
                        break
                    await asyncio.sleep(0.1)
                drain_incomplete = not turn_complete
                reason = "completed"
                for task in tasks:
                    task.cancel()
                await asyncio.gather(*tasks, return_exceptions=True)
    except WebSocketDisconnect:
        error = "Browser disconnected. The received transcript was saved."
    except ValueError:
        error = "Invalid or oversized audio/control message. Session stopped."
        reason = "error"
    except TimeoutError:
        error = "The voice connection timed out. The received transcript was saved."
        reason = "error"
    except Exception:
        error = "Gemini voice connection failed. Check your API key, model access and network, then start a new session."
        reason = "error"
    finally:
        for task in tasks:
            task.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
        with app.state.db() as db:
            training = db.get(TrainingSession, session_id)
            training.ended_at = iso_now()
            training.status = reason
            training.error = error
            if training.started_at:
                training.duration_seconds = max(0, int((utcnow() - datetime.fromisoformat(training.started_at)).total_seconds()))
            roles = {m.speaker for m in training.messages if m.content.strip()}
            if roles != {"salesperson", "customer"}:
                training.transcript_warning = "Both speakers were not transcribed. Transcript-based evaluation is unavailable."
            elif drain_incomplete:
                training.transcript_warning = "Final transcription did not finish before the connection closed. Evaluation is disabled for this incomplete transcript."
            elif reason != "completed" and audio_bytes:
                training.transcript_warning = "The connection ended unexpectedly. The partial transcript is saved; evaluation is disabled."
            db.commit()
        app.state.live_sessions.discard(session_id)
    if graceful and reason == "completed":
        schedule_evaluation(app, session_id)
    with suppress(Exception):
        if error:
            await send({"type": "error", "message": error})
        await send({"type": "ended", "session_id": session_id})
        await ws.close(code=1000)
