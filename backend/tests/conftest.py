"""
Shared test fixtures.

The environment is set before any application module is imported, because
Settings is cached with lru_cache at import time - setting DATABASE_URL later
would leave the app pointed at the developer's real database.
"""

import os
import tempfile
from pathlib import Path

os.environ["ENVIRONMENT"] = "test"
os.environ["SECRET_KEY"] = "test-secret-key-not-used-anywhere-real"
os.environ["DATABASE_URL"] = "sqlite://"          # in-memory
os.environ["UPLOAD_DIR"] = tempfile.mkdtemp(prefix="intellicredit-test-")
os.environ.pop("ANTHROPIC_API_KEY", None)          # tests never call the model
# Off by default: the whole suite shares one TestClient address, so real
# limits would throttle unrelated tests. test_rate_limiting.py turns the
# limiter back on for the cases that are actually about throttling.
os.environ["RATE_LIMIT_ENABLED"] = "false"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

from app.api.deps import get_db  # noqa: E402
from app.db import models  # noqa: F401,E402  - registers tables on Base
from app.db.base import Base  # noqa: E402
from app.main import app as fastapi_app  # noqa: E402


@pytest.fixture
def db_session():
    """
    A fresh in-memory database per test.

    StaticPool keeps every connection pointed at the same in-memory database;
    without it each connection would get its own empty one and the tables
    created here would be invisible to the request under test.
    """
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    session = TestingSession()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)
        engine.dispose()


@pytest.fixture
def client(db_session):
    """A TestClient wired to the per-test database."""
    def override_get_db():
        yield db_session

    fastapi_app.dependency_overrides[get_db] = override_get_db
    with TestClient(fastapi_app) as test_client:
        yield test_client
    fastapi_app.dependency_overrides.clear()


def _register(client, email: str, password: str = "correct-horse-battery") -> str:
    response = client.post(
        "/api/auth/register",
        json={"email": email, "password": password, "full_name": "Test Analyst"},
    )
    assert response.status_code == 201, response.text
    return response.json()["access_token"]


@pytest.fixture
def auth_headers(client):
    """Headers for a registered analyst."""
    token = _register(client, "analyst@bank.example")
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def other_headers(client):
    """A second, unrelated analyst - used to prove cases are isolated."""
    token = _register(client, "other@bank.example")
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def case_id(client, auth_headers) -> int:
    response = client.post(
        "/api/applications",
        json={"company_name": "Vishwakarma Steel Ltd", "sector": "Manufacturing"},
        headers=auth_headers,
    )
    assert response.status_code == 201, response.text
    return response.json()["app_id"]


@pytest.fixture
def rate_limited():
    """
    Enable the limiter for one test and give it a clean counter.

    The counters are process-global, so they must be reset on the way in
    *and* out; leaking a used bucket would make these tests order-dependent.
    """
    from app.core.rate_limit import limiter

    limiter.reset()
    limiter.enabled = True
    try:
        yield limiter
    finally:
        limiter.enabled = False
        limiter.reset()


@pytest.fixture
def upload_dir() -> Path:
    return Path(os.environ["UPLOAD_DIR"])
