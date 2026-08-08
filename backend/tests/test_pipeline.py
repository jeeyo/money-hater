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
    created = await _upload(client, "a.jpg", make_jpeg(color=(1, 2, 3)))
    assert len(created) == 1
    assert created[0]["status"] == "pending"
    jobs = list(in_memory_queue.jobs.values())
    assert len(jobs) == 1
    assert jobs[0]["task_name"] == "analyze_image"
    assert jobs[0]["args"] == {"image_id": created[0]["id"]}


async def test_duplicate_upload_is_skipped(client):
    await register(client)
    data = make_jpeg(color=(9, 9, 9))
    assert len(await _upload(client, "a.jpg", data)) == 1
    assert len(await _upload(client, "again.jpg", data)) == 0


async def test_non_image_rejected(client):
    await register(client)
    response = await client.post(
        "/api/images", files=[("files", ("evil.txt", b"not an image", "text/plain"))]
    )
    assert response.status_code == 415


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
    created = await _upload(client, "x.jpg", make_jpeg(color=(4, 4, 4)))
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
    created = await _upload(client, "a.jpg", make_jpeg(color=(7, 7, 7)))
    image_id = created[0]["id"]

    await client.post("/api/auth/logout")
    await register(client, email="bob@example.com")
    assert (await client.get(f"/api/images/{image_id}")).status_code == 404
    assert (await client.get(f"/api/images/{image_id}/file")).status_code == 404
