"""The human check in front of sign-in and sign-up.

Off by default — the whole suite, and every deployment without a Cloudflare
account, has to keep an ordinary login form.
"""

import httpx
import pytest

import app.services.turnstile as turnstile_mod
from app.config import settings
from tests.conftest import register


class _StubClient:
    """An httpx.AsyncClient stand-in for Cloudflare's siteverify endpoint."""

    payload: dict = {"success": True}
    raises: Exception | None = None
    calls: list[dict] = []

    def __init__(self, *args, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    async def post(self, url, **kwargs):
        cls = type(self)
        cls.calls.append(kwargs.get("data", {}))
        if cls.raises is not None:
            raise cls.raises
        return httpx.Response(200, json=cls.payload, request=httpx.Request("POST", url))


@pytest.fixture
def turnstile(monkeypatch):
    monkeypatch.setattr(settings, "turnstile_site_key", "1x00000000000000000000AA")
    monkeypatch.setattr(settings, "turnstile_secret_key", "1x0000000000000000000000000000000AA")
    _StubClient.payload = {"success": True}
    _StubClient.raises = None
    _StubClient.calls = []
    monkeypatch.setattr(turnstile_mod.httpx, "AsyncClient", _StubClient)
    return _StubClient


async def test_config_hides_the_key_when_unconfigured(client):
    response = await client.get("/api/auth/config")
    assert response.status_code == 200
    assert response.json() == {"turnstile_site_key": None}


async def test_config_publishes_the_site_key(client, turnstile):
    response = await client.get("/api/auth/config")
    assert response.json()["turnstile_site_key"] == "1x00000000000000000000AA"


async def test_login_without_turnstile_configured_needs_no_token(client):
    await register(client)
    await client.post("/api/auth/logout")
    response = await client.post(
        "/api/auth/login", json={"email": "user@example.com", "password": "password123"}
    )
    assert response.status_code == 200


async def test_login_requires_a_token_when_configured(client, turnstile):
    response = await client.post(
        "/api/auth/login", json={"email": "user@example.com", "password": "password123"}
    )
    assert response.status_code == 400
    # Rejected before the password is looked at, so it cannot double as an oracle
    assert turnstile.calls == []


async def test_login_passes_the_token_to_cloudflare(client, turnstile):
    await register(client, password="password123", turnstile_token="tok-register")
    await client.post("/api/auth/logout")

    response = await client.post(
        "/api/auth/login",
        json={
            "email": "user@example.com",
            "password": "password123",
            "turnstile_token": "tok-login",
        },
    )
    assert response.status_code == 200
    assert [call["response"] for call in turnstile.calls] == ["tok-register", "tok-login"]
    assert turnstile.calls[0]["secret"] == settings.turnstile_secret_key


async def test_login_rejected_when_cloudflare_says_no(client, turnstile):
    turnstile.payload = {"success": False, "error-codes": ["invalid-input-response"]}
    response = await client.post(
        "/api/auth/login",
        json={"email": "user@example.com", "password": "password123", "turnstile_token": "nope"},
    )
    assert response.status_code == 400
    assert "Human check" in response.json()["detail"]


async def test_login_fails_closed_when_cloudflare_is_unreachable(client, turnstile):
    turnstile.raises = httpx.ConnectError("boom")
    response = await client.post(
        "/api/auth/login",
        json={"email": "user@example.com", "password": "password123", "turnstile_token": "tok"},
    )
    assert response.status_code == 503


async def test_half_configured_turnstile_is_refused(monkeypatch):
    monkeypatch.setenv("TURNSTILE_SITE_KEY", "1x00000000000000000000AA")
    monkeypatch.delenv("TURNSTILE_SECRET_KEY", raising=False)
    with pytest.raises(ValueError, match="TURNSTILE_SECRET_KEY"):
        type(settings)(_env_file=None)
