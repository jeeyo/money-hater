"""A corrected photo time wins without destroying the camera's value."""

from datetime import UTC, datetime

from app.models import Image
from app.services.analysis import run_image_analysis
from tests.conftest import register
from tests.util import make_jpeg


async def test_override_and_restore_exif_time(client, db_sessionmaker):
    await register(client)
    original = datetime(2026, 8, 8, 12, 0, tzinfo=UTC)
    created = (
        await client.post(
            "/api/images",
            files=[("files", ("a.jpg", make_jpeg(taken_at=original), "image/jpeg"))],
        )
    ).json()[0]
    image_id = created["id"]
    assert created["exif_taken_at"].startswith("2026-08-08T12:00")

    response = await client.patch(
        f"/api/images/{image_id}", json={"taken_at": "2026-08-09T17:45:00Z"}
    )
    assert response.status_code == 200, response.text
    assert response.json()["taken_at"].startswith("2026-08-09T17:45")
    assert response.json()["taken_at_source"] == "custom"
    assert response.json()["exif_taken_at"].startswith("2026-08-08T12:00")

    # Re-analysis may read EXIF again, but cannot answer over the user.
    async with db_sessionmaker() as db:
        await run_image_analysis(db, image_id)
    assert (await client.get(f"/api/images/{image_id}")).json()["taken_at_source"] == "custom"

    restored = await client.patch(f"/api/images/{image_id}", json={"taken_at": None})
    assert restored.status_code == 200, restored.text
    assert restored.json()["taken_at"].startswith("2026-08-08T12:00")
    assert restored.json()["taken_at_source"] == "exif"


async def test_cannot_restore_when_photo_has_no_exif_time(client, db_sessionmaker):
    await register(client)
    created = (
        await client.post(
            "/api/images", files=[("files", ("a.jpg", make_jpeg(), "image/jpeg"))]
        )
    ).json()[0]
    response = await client.patch(f"/api/images/{created['id']}", json={"taken_at": None})
    assert response.status_code == 409

    async with db_sessionmaker() as db:
        image = await db.get(Image, created["id"])
        assert image.taken_at_source == "upload"
