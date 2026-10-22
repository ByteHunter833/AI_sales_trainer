from pathlib import Path

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parents[1] / ".env", extra="ignore"
    )
    gemini_api_key: SecretStr = SecretStr("")
    gemini_live_model: str = ""
    gemini_evaluation_model: str = ""
    database_url: str = "sqlite:///./salespilot.db"
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173",
                               "http://localhost:8000", "http://127.0.0.1:8000"]
    max_concurrent_sessions: int = Field(default=2, ge=1, le=10)
    max_session_seconds: int = Field(default=600, ge=30, le=900)
    evaluation_timeout_seconds: int = Field(default=90, ge=5, le=180)
    max_audio_bytes: int = 16384

    @field_validator("cors_origins")
    @classmethod
    def explicit_origins(cls, values):
        if not values or any(v == "*" or not v.startswith(("http://", "https://")) for v in values):
            raise ValueError("Configure explicit HTTP(S) CORS origins")
        return values

    @field_validator("database_url")
    @classmethod
    def sqlite_only(cls, value):
        if not value.startswith("sqlite:///"):
            raise ValueError("This MVP supports SQLite database URLs")
        return value

    @property
    def missing_configuration(self) -> list[str]:
        return [key.upper() for key in ("gemini_api_key", "gemini_live_model", "gemini_evaluation_model")
                if not (getattr(self, key).get_secret_value() if key == "gemini_api_key" else getattr(self, key)).strip()]
