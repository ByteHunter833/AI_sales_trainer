from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

from app.database import TrainingSession, TranscriptMessage
from app.main import create_app


def test_empty_dashboard_and_health(client):
    dashboard = client.get("/api/dashboard").json()
    assert dashboard["total_sessions"] == 0
    assert dashboard["average_score"] is None
    assert dashboard["trend"] == [] and dashboard["skills"] == {}
    health = client.get("/api/health").json()
    assert health["status"] == "ok"
    assert health["ai_ready"] is False
    assert "GEMINI_API_KEY" in health["missing_configuration"]


def test_create_retrieve_and_history(client):
    response = client.post("/api/sessions", json={"language": "ru", "personality": "analytical"})
    assert response.status_code == 201
    session = response.json()
    assert session["status"] == "created"
    assert session["overall_score"] is None
    detail = client.get(f"/api/sessions/{session['id']}").json()
    assert detail["language"] == "ru" and detail["messages"] == []
    history = client.get("/api/sessions").json()
    assert history["total"] == 1 and history["items"][0]["id"] == session["id"]
    assert client.get("/api/dashboard").json()["total_sessions"] == 0
    assert client.get(f"/api/sessions/{session['id']}/evaluation").status_code == 409
    assert client.post(f"/api/sessions/{session['id']}/evaluate").status_code == 409


def test_input_limits_and_errors(client):
    assert client.post("/api/sessions", json={"scenario": "fake"}).status_code == 422
    assert client.post("/api/sessions", json={"product_description": "   "}).status_code == 422
    assert client.post("/api/sessions", json={"product_description": "x" * 3001}).status_code == 422
    assert client.post("/api/sessions", content=b"x" * 17000).status_code == 413
    assert client.get("/api/sessions?limit=1000").status_code == 422
    assert client.get("/api/sessions/missing").status_code == 404
    assert client.post("/api/sessions/missing/evaluate").status_code == 404


def test_cross_origin_mutation_rejected(client):
    assert client.post("/api/sessions", json={}, headers={"origin": "https://untrusted.example"}).status_code == 403
    response = client.get("/api/health", headers={"origin": "http://localhost:5173"})
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert "access-control-allow-origin" not in client.get("/api/health", headers={"origin": "https://untrusted.example"}).headers


def test_crash_recovery(app, client):
    session_id = client.post("/api/sessions", json={}).json()["id"]
    with app.state.db() as db:
        session = db.get(TrainingSession, session_id)
        session.status = "active"
        session.started_at = (datetime.now(timezone.utc) - timedelta(seconds=15)).isoformat()
        db.commit()
    with TestClient(create_app(app.state.settings)) as restarted:
        session = restarted.get(f"/api/sessions/{session_id}").json()
        assert session["status"] == "interrupted"
        assert session["duration_seconds"] >= 15
        assert session["transcript_warning"]


def test_cascading_session_relationships(app, client):
    session_id = client.post("/api/sessions", json={}).json()["id"]
    with app.state.db() as db:
        session = db.get(TrainingSession, session_id)
        message = TranscriptMessage(session_id=session_id, speaker="customer", content="Hello", sequence=1)
        session.messages.append(message)
        db.commit(); message_id = message.id
        db.delete(session); db.commit()
        assert db.get(TranscriptMessage, message_id) is None
