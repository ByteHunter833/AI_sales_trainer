from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import JSON, ForeignKey, String, Text, create_engine, event
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship, sessionmaker


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def iso_now() -> str:
    return utcnow().isoformat()


class Base(DeclarativeBase):
    pass


class TrainingSession(Base):
    __tablename__ = "training_sessions"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid4()))
    scenario: Mapped[str]
    personality: Mapped[str]
    difficulty: Mapped[str]
    language: Mapped[str]
    product_description: Mapped[str] = mapped_column(Text)
    created_at: Mapped[str] = mapped_column(default=iso_now)
    started_at: Mapped[str | None]
    ended_at: Mapped[str | None]
    duration_seconds: Mapped[int] = mapped_column(default=0)
    status: Mapped[str] = mapped_column(default="created")
    overall_score: Mapped[int | None]
    error: Mapped[str | None]
    transcript_warning: Mapped[str | None]
    messages: Mapped[list["TranscriptMessage"]] = relationship(
        cascade="all, delete-orphan", order_by="TranscriptMessage.sequence"
    )
    evaluation: Mapped["Evaluation | None"] = relationship(cascade="all, delete-orphan")


class TranscriptMessage(Base):
    __tablename__ = "transcript_messages"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid4()))
    session_id: Mapped[str] = mapped_column(ForeignKey("training_sessions.id"), index=True)
    sequence: Mapped[int]
    speaker: Mapped[str]
    content: Mapped[str] = mapped_column(Text)
    timestamp: Mapped[str] = mapped_column(default=iso_now)


class Evaluation(Base):
    __tablename__ = "evaluations"
    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[str] = mapped_column(ForeignKey("training_sessions.id"), unique=True)
    overall_score: Mapped[int]
    categories: Mapped[dict] = mapped_column(JSON)
    strengths: Mapped[list] = mapped_column(JSON)
    weaknesses: Mapped[list] = mapped_column(JSON)
    recommendations: Mapped[list] = mapped_column(JSON)
    summary: Mapped[str] = mapped_column(Text)
    created_at: Mapped[str] = mapped_column(default=iso_now)


def make_database(url: str):
    engine = create_engine(url, connect_args={"check_same_thread": False, "timeout": 15})

    @event.listens_for(engine, "connect")
    def configure_sqlite(connection, _):
        connection.execute("PRAGMA foreign_keys=ON")
        connection.execute("PRAGMA journal_mode=WAL")

    return engine, sessionmaker(engine, expire_on_commit=False)
