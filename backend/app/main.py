import asyncio
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query, Request, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import func, select

from app.config import Settings
from app.database import Base, Evaluation, TrainingSession, iso_now, make_database, utcnow
from app.schemas import EvaluationOut, SessionCreate, SessionDetail, SessionOut
from app.services.evaluator import generate_report
from app.services.gemini_live import connect_live
from app.training import schedule_evaluation, training_socket


def create_app(settings: Settings | None = None):
    settings = settings or Settings()
    engine, factory = make_database(settings.database_url)

    @asynccontextmanager
    async def lifespan(app):
        Base.metadata.create_all(engine)
        with factory() as db:
            # A single backend worker owns live connections and evaluation tasks.
            stale = db.scalars(select(TrainingSession).where(TrainingSession.status.in_(["connecting", "active", "evaluating"]))).all()
            for session in stale:
                if session.status == "evaluating":
                    session.status = "evaluation_error"
                    session.error = "The server restarted during evaluation. Retry the evaluation."
                else:
                    session.status = "interrupted"
                    session.error = "The server restarted during training. Start a new session."
                    session.transcript_warning = "The voice session was interrupted; its transcript may be incomplete."
                    session.ended_at = iso_now()
                    if session.started_at:
                        session.duration_seconds = min(settings.max_session_seconds, max(0, int((utcnow() - datetime.fromisoformat(session.started_at)).total_seconds())))
            db.commit()
        yield
        for task in list(app.state.tasks):
            task.cancel()
        await asyncio.gather(*app.state.tasks, return_exceptions=True)
        engine.dispose()

    app = FastAPI(title="SalesPilot AI", lifespan=lifespan)
    app.state.settings = settings
    app.state.db = factory
    app.state.engine = engine
    app.state.live_sessions = set()
    app.state.evaluating = set()
    app.state.tasks = set()
    app.state.report_generator = generate_report
    app.state.live_connector = connect_live
    app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins,
                       allow_methods=["GET", "POST"], allow_headers=["Content-Type"])

    @app.middleware("http")
    async def request_safeguards(request: Request, call_next):
        if request.method == "POST":
            origin = request.headers.get("origin")
            if origin and origin not in settings.cors_origins:
                return JSONResponse({"detail": "Origin not allowed"}, status_code=403)
            if request.headers.get("sec-fetch-site") == "cross-site" and not origin:
                return JSONResponse({"detail": "Cross-site request rejected"}, status_code=403)
            # Bound streamed/chunked bodies too, before JSON parsing.
            body = bytearray()
            async for chunk in request.stream():
                body.extend(chunk)
                if len(body) > 16384:
                    return JSONResponse({"detail": "Request too large"}, status_code=413)
            request._body = bytes(body)
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "same-origin"
        return response

    @app.exception_handler(Exception)
    async def unexpected_error(_request, _exc):
        return JSONResponse({"detail": "An unexpected server error occurred. Please try again."}, status_code=500)

    @app.get("/api/health")
    def health():
        with factory() as db:
            db.execute(select(1))
        return {"status": "ok", "mode": "single_user_demo", "ai_ready": not settings.missing_configuration,
                "missing_configuration": settings.missing_configuration,
                "max_session_seconds": settings.max_session_seconds}

    @app.post("/api/sessions", response_model=SessionOut, status_code=201)
    def create_session(payload: SessionCreate):
        with factory() as db:
            session = TrainingSession(**payload.model_dump())
            db.add(session)
            db.commit()
            return SessionOut.model_validate(session)

    @app.get("/api/sessions")
    def list_sessions(limit: int = Query(20, ge=1, le=100), offset: int = Query(0, ge=0)):
        with factory() as db:
            sessions = db.scalars(select(TrainingSession).order_by(TrainingSession.created_at.desc()).limit(limit).offset(offset)).all()
            return {"items": [SessionOut.model_validate(s) for s in sessions],
                    "total": db.scalar(select(func.count()).select_from(TrainingSession))}

    @app.get("/api/sessions/{session_id}", response_model=SessionDetail)
    def session_detail(session_id: str):
        with factory() as db:
            session = db.get(TrainingSession, session_id)
            if not session:
                raise HTTPException(404, "Session not found")
            return SessionDetail.model_validate(session)

    @app.post("/api/sessions/{session_id}/evaluate", status_code=202)
    async def evaluate(session_id: str):
        with factory() as db:
            session = db.get(TrainingSession, session_id)
            if not session:
                raise HTTPException(404, "Session not found")
            if session.status in {"created", "connecting", "active"}:
                raise HTTPException(409, "End the voice session before requesting evaluation")
            if session.evaluation:
                return {"status": "evaluated"}
            if session.status == "evaluating" or session_id in app.state.evaluating:
                return {"status": "evaluating"}
        schedule_evaluation(app, session_id)
        return {"status": "queued"}

    @app.get("/api/sessions/{session_id}/evaluation", response_model=EvaluationOut)
    def evaluation_detail(session_id: str):
        with factory() as db:
            session = db.get(TrainingSession, session_id)
            if not session:
                raise HTTPException(404, "Session not found")
            if not session.evaluation:
                raise HTTPException(409, f"Evaluation is not ready: {session.status}")
            return EvaluationOut.model_validate(session.evaluation)

    @app.get("/api/dashboard")
    def dashboard():
        with factory() as db:
            total, duration = db.execute(select(func.count(), func.coalesce(func.sum(TrainingSession.duration_seconds), 0)).where(TrainingSession.started_at.is_not(None))).one()
            scores = db.scalars(select(TrainingSession.overall_score).where(TrainingSession.overall_score.is_not(None)).order_by(TrainingSession.started_at)).all()
            recent = db.scalars(select(TrainingSession).order_by(TrainingSession.created_at.desc()).limit(5)).all()
            evaluations = db.scalars(select(Evaluation)).all()
            categories = evaluations[0].categories.keys() if evaluations else []
            skills = {key: round(sum(e.categories[key] for e in evaluations) / len(evaluations), 1) for key in categories}
            improvement = round((scores[-1] - scores[0]) / scores[0] * 100, 1) if len(scores) > 1 and scores[0] else None
            trend_sessions = db.scalars(select(TrainingSession).where(TrainingSession.overall_score.is_not(None)).order_by(TrainingSession.started_at.desc()).limit(20)).all()
            return {"total_sessions": total, "average_score": round(sum(scores) / len(scores), 1) if scores else None,
                    "total_duration_seconds": duration, "improvement_percentage": improvement,
                    "evaluated_sessions": len(scores), "skills": skills,
                    "recent_sessions": [SessionOut.model_validate(s) for s in recent],
                    "trend": [{"id": s.id, "date": s.started_at, "score": s.overall_score} for s in reversed(trend_sessions)]}

    @app.websocket("/ws/training/{session_id}")
    async def websocket(ws: WebSocket, session_id: str):
        await training_socket(ws, session_id)

    dist = Path(__file__).resolve().parents[2] / "frontend" / "dist"
    if dist.exists():
        # Hash-based frontend routing allows direct reloads with this static mount.
        app.mount("/", StaticFiles(directory=dist, html=True), name="frontend")
    return app


app = create_app()
