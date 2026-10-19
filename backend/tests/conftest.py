from __future__ import annotations

import os
import uuid
from pathlib import Path

import httpx
import pytest

try:  # testcontainers >= 4.9 moved community modules
    from testcontainers.community.postgres import PostgresContainer
except ImportError:  # pragma: no cover
    from testcontainers.postgres import PostgresContainer

BACKEND_DIR = Path(__file__).resolve().parent.parent

_pg: PostgresContainer | None = None


def _start_postgres() -> PostgresContainer:
    last_error: Exception | None = None
    for image in ("postgres:18-alpine", "postgres:17-alpine", "postgres:16-alpine"):
        try:
            container = PostgresContainer(image, driver="asyncpg")
            container.start()
            return container
        except Exception as exc:  # image pull failures etc.
            last_error = exc
    raise RuntimeError(f"Could not start postgres container: {last_error}")


def pytest_configure(config) -> None:
    global _pg
    if _pg is not None:
        return
    _pg = _start_postgres()

    host = _pg.get_container_host_ip()
    port = _pg.get_exposed_port(5432)
    dbname = _pg.dbname
    migration_url = (
        f"postgresql+asyncpg://{_pg.username}:{_pg.password}@{host}:{port}/{dbname}"
    )
    app_url = (
        f"postgresql+asyncpg://app_user:app_password@{host}:{port}/{dbname}"
    )
    os.environ["ENV"] = "test"
    os.environ["MIGRATION_DATABASE_URL"] = migration_url
    os.environ["DATABASE_URL"] = app_url
    os.environ["APP_DB_PASSWORD"] = "app_password"
    os.environ["JWT_SECRET"] = "test-secret-for-tests-only-0123456789abcdef"
    os.environ["RATE_LIMIT_ENABLED"] = "false"
    os.environ["REDIS_URL"] = "redis://localhost:6399/15"

    from alembic import command
    from alembic.config import Config as AlembicConfig

    cfg = AlembicConfig(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    command.upgrade(cfg, "head")


def pytest_unconfigure(config) -> None:
    global _pg
    if _pg is not None:
        _pg.stop()
        _pg = None


@pytest.fixture
async def client():
    from app.main import app

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(
        transport=transport, base_url="http://testserver"
    ) as c:
        yield c


def uniq(prefix: str = "t") -> str:
    return f"{prefix}{uuid.uuid4().hex[:8]}"


async def signup_tenant(
    client: httpx.AsyncClient, slug: str | None = None, email: str | None = None
) -> dict:
    slug = slug or uniq()
    email = email or f"owner@{slug}.io"
    response = await client.post(
        "/api/v1/auth/signup",
        json={
            "tenant_name": f"Org {slug}",
            "slug": slug,
            "email": email,
            "password": "password123",
            "full_name": "Owner Person",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def auth_header(tokens: dict) -> dict[str, str]:
    return {"Authorization": f"Bearer {tokens['access_token']}"}
