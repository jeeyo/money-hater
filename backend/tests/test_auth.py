from tests.conftest import register


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
