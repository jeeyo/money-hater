"""End-to-end pipeline tests: upload -> analyze -> timeline (no external APIs)."""

from datetime import UTC, datetime

import sqlalchemy as sa

from app.models import Image, Visit
from app.services.analysis import run_image_analysis
from tests.conftest import register
from tests.util import make_jpeg

BKK = (13.7563, 100.5018)


async def _upload(client, filename: str, data: bytes) -> list[dict]:
    response = await client.post(
        "/api/images", files=[("files", (filename, data, "image/jpeg"))]
    )
    assert response.status_code == 201, response.text
    return response.json()


async def test_upload_defers_analysis_job(client, in_memory_queue):
    await register(client)
    created = await _upload(client, "a.jpg", make_jpeg(*BKK, color=(1, 2, 3)))
    assert len(created) == 1
    assert created[0]["status"] == "pending"
    jobs = list(in_memory_queue.jobs.values())
    assert len(jobs) == 1
    assert jobs[0]["task_name"] == "analyze_image"
    assert jobs[0]["args"] == {"image_id": created[0]["id"]}


async def test_duplicate_upload_is_skipped(client):
    await register(client)
    data = make_jpeg(*BKK, color=(9, 9, 9))
    assert len(await _upload(client, "a.jpg", data)) == 1
    assert len(await _upload(client, "again.jpg", data)) == 0


async def test_non_image_rejected(client):
    await register(client)
    response = await client.post(
        "/api/images", files=[("files", ("evil.txt", b"not an image", "text/plain"))]
    )
    assert response.status_code == 415


async def test_a_photo_without_location_is_refused(client):
    """Location is what makes a photo an itinerary entry rather than a picture."""
    await register(client)
    response = await client.post(
        "/api/images", files=[("files", ("no-gps.jpg", make_jpeg(color=(3, 3, 3)), "image/jpeg"))]
    )
    assert response.status_code == 422
    detail = response.json()["detail"]
    assert "no-gps.jpg" in detail, "the message must name the file the user picked"
    # It has to say how to fix it: phones strip location on share by default
    assert "location" in detail.lower()


async def test_a_photo_with_a_timestamp_but_no_location_is_still_refused(client):
    """EXIF alone is not enough — the GPS tags are the requirement."""
    await register(client)
    response = await client.post(
        "/api/images",
        files=[
            (
                "files",
                ("timed.jpg", make_jpeg(taken_at=datetime(2026, 8, 8, 12, 0)), "image/jpeg"),
            )
        ],
    )
    assert response.status_code == 422


async def test_a_located_photo_without_a_timestamp_is_accepted(client):
    """Only location is mandatory; the clock falls back to the upload time."""
    await register(client)
    response = await client.post(
        "/api/images", files=[("files", ("located.jpg", make_jpeg(*BKK), "image/jpeg"))]
    )
    assert response.status_code == 201, response.text


async def test_one_unlocated_photo_rejects_the_whole_batch_cleanly(client, db_sessionmaker):
    """And leaves nothing on disk — the client uploads one per request anyway."""
    from app.config import settings

    await register(client)
    response = await client.post(
        "/api/images",
        files=[
            ("files", ("located.jpg", make_jpeg(*BKK, color=(1, 1, 1)), "image/jpeg")),
            ("files", ("no-gps.jpg", make_jpeg(color=(2, 2, 2)), "image/jpeg")),
        ],
    )
    assert response.status_code == 422

    async with db_sessionmaker() as db:
        assert await db.scalar(sa.select(sa.func.count()).select_from(Image)) == 0
    originals = list(settings.media_root.rglob("*")) if settings.media_root.exists() else []
    assert [p for p in originals if p.is_file()] == []


async def test_a_rejected_batch_leaves_nothing_behind(client, db_sessionmaker):
    """A phone selection is many files at once; one bad one must not litter.

    The whole batch is validated before anything is written, so a rejection
    cannot leave saved originals on disk with no rows pointing at them.
    """
    from app.config import settings

    await register(client)
    response = await client.post(
        "/api/images",
        files=[
            ("files", ("good.jpg", make_jpeg(*BKK, color=(4, 5, 6)), "image/jpeg")),
            ("files", ("evil.txt", b"not an image", "text/plain")),
        ],
    )
    assert response.status_code == 415

    async with db_sessionmaker() as db:
        assert await db.scalar(sa.select(sa.func.count()).select_from(Image)) == 0
    originals = list(settings.media_root.rglob("*")) if settings.media_root.exists() else []
    assert [p for p in originals if p.is_file()] == []


async def test_a_photo_with_no_content_type_is_still_accepted(client):
    """Gallery and share-sheet files often arrive with an empty MIME type."""
    await register(client)
    response = await client.post(
        "/api/images", files=[("files", ("IMG_0001.HEIC", make_jpeg(*BKK, color=(7, 7, 7)), ""))]
    )
    assert response.status_code == 201, response.text
    # The bytes are what decide it, not the label the phone attached
    assert response.json()[0]["mime"] == "image/jpeg"


async def test_analysis_extracts_exif_and_builds_timeline(client, db_sessionmaker):
    await register(client)
    taken = datetime(2026, 8, 8, 12, 30, tzinfo=UTC)
    created = await _upload(client, "lunch.jpg", make_jpeg(*BKK, taken_at=taken))
    image_id = created[0]["id"]

    async with db_sessionmaker() as db:
        await run_image_analysis(db, image_id)

    async with db_sessionmaker() as db:
        image = await db.get(Image, image_id)
        assert image.status == "analyzed"
        assert image.taken_at_source == "exif"
        assert abs(image.lat - BKK[0]) < 1e-3
        assert image.thumb_path is not None
        assert image.visit_id is not None
        visit = await db.get(Visit, image.visit_id)
        assert visit.user_id == image.user_id

    response = await client.get(
        "/api/timeline", params={"date": "2026-08-08", "tz_offset_minutes": 0}
    )
    assert response.status_code == 200
    day = response.json()
    assert day["trip"] is None  # no trip until the user makes one
    assert len(day["visits"]) == 1
    assert day["visits"][0]["images"][0]["id"] == image_id


async def test_two_images_far_apart_make_two_visits(client, db_sessionmaker):
    await register(client)
    first = await _upload(
        client, "one.jpg", make_jpeg(*BKK, taken_at=datetime(2026, 8, 8, 9, 0, tzinfo=UTC))
    )
    second = await _upload(
        client,
        "two.jpg",
        make_jpeg(13.80, 100.55, taken_at=datetime(2026, 8, 8, 9, 30, tzinfo=UTC), color=(0, 0, 9)),
    )
    async with db_sessionmaker() as db:
        await run_image_analysis(db, first[0]["id"])
    async with db_sessionmaker() as db:
        await run_image_analysis(db, second[0]["id"])

    async with db_sessionmaker() as db:
        visits = (await db.execute(sa.select(Visit))).scalars().all()
        assert len(visits) == 2


async def test_reanalyze_and_delete(client, db_sessionmaker, in_memory_queue):
    await register(client)
    created = await _upload(client, "x.jpg", make_jpeg(*BKK, color=(4, 4, 4)))
    image_id = created[0]["id"]
    async with db_sessionmaker() as db:
        await run_image_analysis(db, image_id)

    response = await client.post(f"/api/images/{image_id}/reanalyze")
    assert response.status_code == 200
    assert response.json()["status"] == "pending"

    response = await client.delete(f"/api/images/{image_id}")
    assert response.status_code == 204
    assert (await client.get(f"/api/images/{image_id}")).status_code == 404


async def test_image_access_is_user_scoped(client, db_sessionmaker):
    await register(client, email="alice@example.com")
    created = await _upload(client, "a.jpg", make_jpeg(*BKK, color=(7, 7, 7)))
    image_id = created[0]["id"]

    await client.post("/api/auth/logout")
    await register(client, email="bob@example.com")
    assert (await client.get(f"/api/images/{image_id}")).status_code == 404
    assert (await client.get(f"/api/images/{image_id}/file")).status_code == 404
