import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


@pytest.fixture
def app(tmp_path):
    settings = Settings(_env_file=None, database_url=f"sqlite:///{tmp_path}/test.db")
    return create_app(settings)


@pytest.fixture
def client(app):
    with TestClient(app) as client:
        yield client
