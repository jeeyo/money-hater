from collections.abc import AsyncIterator

import pytest
from httpx import ASGITransport, AsyncClient
from procrastinate import testing
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.config import settings
from app.db import get_db
from app.main import api, app
from app.models import Base
from app.queue import queue_app


@pytest.fixture
async def db_sessionmaker(tmp_path, monkeypatch):
    engine = create_async_engine(
        "sqlite+aiosqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    maker = async_sessionmaker(engine, expire_on_commit=False)
    monkeypatch.setattr(settings, "media_root", tmp_path / "media")
    yield maker
    await engine.dispose()


@pytest.fixture
async def db(db_sessionmaker):
    async with db_sessionmaker() as session:
        yield session


@pytest.fixture
async def in_memory_queue():
    connector = testing.InMemoryConnector()
    with queue_app.replace_connector(connector):
        yield connector


@pytest.fixture
async def client(db_sessionmaker, in_memory_queue) -> AsyncIterator[AsyncClient]:
    async def override_get_db():
        async with db_sessionmaker() as session:
            yield session

    api.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as http:
        yield http
    api.dependency_overrides.clear()
    app.dependency_overrides.clear()


async def register(client: AsyncClient, email="user@example.com", password="password123") -> dict:
    response = await client.post("/api/auth/register", json={"email": email, "password": password})
    assert response.status_code == 201, response.text
    return response.json()
