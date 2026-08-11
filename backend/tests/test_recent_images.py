"""The upload page's recent list — newest photo first, regardless of session."""

from tests.conftest import register
from tests.util import make_jpeg


async def test_recent_images_are_newest_first(client):
    await register(client)
    for name, color in (("a.jpg", (10, 10, 10)), ("b.jpg", (20, 20, 20)), ("c.jpg", (30, 30, 30))):
        response = await client.post(
            "/api/images", files=[("files", (name, make_jpeg(color=color), "image/jpeg"))]
        )
        assert response.status_code == 201, response.text

    listed = (await client.get("/api/images")).json()
    assert [image["mime"] for image in listed] == ["image/jpeg"] * 3
    ids = [image["id"] for image in listed]
    assert ids == sorted(ids, reverse=True)


async def test_recent_images_are_scoped_to_the_caller(client):
    await register(client, email="a@example.com")
    await client.post("/api/images", files=[("files", ("a.jpg", make_jpeg(), "image/jpeg"))])

    await register(client, email="b@example.com")
    await client.post("/api/images", files=[("files", ("b.jpg", make_jpeg(), "image/jpeg"))])

    listed = (await client.get("/api/images")).json()
    assert len(listed) == 1


async def test_recent_images_respects_limit(client):
    await register(client)
    for name, color in (("a.jpg", (10, 10, 10)), ("b.jpg", (20, 20, 20)), ("c.jpg", (30, 30, 30))):
        await client.post("/api/images", files=[("files", (name, make_jpeg(color=color), "image/jpeg"))])

    listed = (await client.get("/api/images?limit=2")).json()
    assert len(listed) == 2
