from datetime import UTC, datetime, timedelta

import sqlalchemy as sa

from app.config import settings
from app.models import AuthSession
from tests.conftest import register


def _present_refresh(client, token: str) -> None:
    """Send `token` on the next request, as the only mh_refresh cookie.

    Reuses whatever domain and path the server set the real one on: two
    cookies of the same name in the jar makes httpx raise rather than choose.
    """
    domain, path = "test", "/api/auth"
    for cookie in list(client.cookies.jar):
        if cookie.name == "mh_refresh":
            domain, path = cookie.domain, cookie.path
            client.cookies.jar.clear(cookie.domain, cookie.path, cookie.name)
    client.cookies.set("mh_refresh", token, domain=domain, path=path)


async def test_register_login_me_flow(client):
    user = await register(client)
    assert user["email"] == "user@example.com"

    response = await client.get("/api/auth/me")
    assert response.status_code == 200
    assert response.json()["id"] == user["id"]

    response = await client.post("/api/auth/logout")
    assert response.status_code == 204
    assert (await client.get("/api/auth/me")).status_code == 401

    response = await client.post(
        "/api/auth/login", json={"email": "user@example.com", "password": "password123"}
    )
    assert response.status_code == 200
    assert (await client.get("/api/auth/me")).status_code == 200


async def test_register_duplicate_email(client):
    await register(client)
    response = await client.post(
        "/api/auth/register", json={"email": "user@example.com", "password": "password123"}
    )
    assert response.status_code == 409


async def test_login_wrong_password(client):
    await register(client)
    response = await client.post(
        "/api/auth/login", json={"email": "user@example.com", "password": "wrong-password"}
    )
    assert response.status_code == 401


async def test_refresh_rotates_token(client):
    await register(client)
    old_refresh = client.cookies.get("mh_refresh")
    # Drop the access cookie to prove refresh alone re-authenticates
    client.cookies.delete("mh_access")
    assert (await client.get("/api/auth/me")).status_code == 401

    response = await client.post("/api/auth/refresh")
    assert response.status_code == 200
    assert client.cookies.get("mh_refresh") != old_refresh
    assert (await client.get("/api/auth/me")).status_code == 200


async def test_refresh_survives_two_tabs_racing(client, db):
    """A rotated token is honoured briefly, so the slower tab is not signed out.

    Both tabs hold the same cookie; whichever loses the race presents a token
    that was revoked milliseconds ago, and used to be thrown out for it.
    """
    await register(client)
    shared_refresh = client.cookies.get("mh_refresh")

    assert (await client.post("/api/auth/refresh")).status_code == 200

    _present_refresh(client, shared_refresh)
    response = await client.post("/api/auth/refresh")
    assert response.status_code == 200
    # The loser is handed its own live session rather than the door
    assert client.cookies.get("mh_refresh") != shared_refresh
    client.cookies.delete("mh_access")
    assert (await client.post("/api/auth/refresh")).status_code == 200
    assert (await client.get("/api/auth/me")).status_code == 200


async def test_refresh_rejects_a_token_revoked_long_ago(client, db):
    await register(client)
    stale_refresh = client.cookies.get("mh_refresh")
    assert (await client.post("/api/auth/refresh")).status_code == 200

    # Age the revocation past the grace window
    long_ago = datetime.now(UTC) - timedelta(seconds=settings.refresh_rotation_grace_seconds + 60)
    await db.execute(
        sa.update(AuthSession).where(AuthSession.revoked_at.is_not(None)).values(revoked_at=long_ago)
    )
    await db.commit()

    _present_refresh(client, stale_refresh)
    assert (await client.post("/api/auth/refresh")).status_code == 401


async def test_grace_window_does_not_slide_on_replay(client, db):
    """Replaying a rotated token must not keep renewing its own grace period."""
    await register(client)
    shared_refresh = client.cookies.get("mh_refresh")
    assert (await client.post("/api/auth/refresh")).status_code == 200

    first = sa.select(AuthSession.revoked_at).order_by(AuthSession.id).limit(1)
    revoked_at = await db.scalar(first)
    assert revoked_at is not None

    _present_refresh(client, shared_refresh)
    assert (await client.post("/api/auth/refresh")).status_code == 200
    assert await db.scalar(first) == revoked_at


async def test_logout_ends_the_session_for_good(client):
    await register(client)
    refresh_token = client.cookies.get("mh_refresh")
    await client.post("/api/auth/logout")

    _present_refresh(client, refresh_token)
    assert (await client.post("/api/auth/refresh")).status_code == 401


async def test_settings_update(client):
    await register(client)
    response = await client.patch(
        "/api/auth/me",
        json={"preferred_currency": "thb", "home_lat": 13.75, "home_lng": 100.5},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["preferred_currency"] == "THB"
    assert body["home_lat"] == 13.75
