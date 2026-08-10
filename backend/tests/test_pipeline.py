"""End-to-end pipeline tests: upload -> analyze -> timeline (no external APIs)."""

from datetime import UTC, datetime

import sqlalchemy as sa

from app.models import Image, Visit
from app.services.analysis import run_image_analysis
from tests.conftest import register
from tests.util import NO_FIX_DMS, make_jpeg

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


async def test_a_photo_without_location_is_accepted(client):
    """A screenshot of a receipt has no GPS and is still worth logging."""
    await register(client)
    created = await _upload(client, "no-gps.jpg", make_jpeg(color=(3, 3, 3)))
    assert len(created) == 1
    assert created[0]["status"] == "pending"
    assert created[0]["lat"] is None and created[0]["lng"] is None


async def test_a_photo_whose_gps_never_fixed_is_accepted_with_no_location(client):
    """GPS tags full of NaN are no location, but they are not a reason to refuse.

    They used to take the analysis down with a "float values are not JSON
    compliant" error; what matters now is that they come out as no location at
    all rather than as coordinates in the middle of the ocean.
    """
    await register(client)
    created = await _upload(
        client, "no-fix.jpg", make_jpeg(gps_dms=(NO_FIX_DMS, NO_FIX_DMS), color=(3, 4, 5))
    )
    assert created[0]["lat"] is None and created[0]["lng"] is None


async def test_a_photo_with_a_timestamp_but_no_location_keeps_its_timestamp(client):
    """The clock is the half that places an unlocated photo, so it must survive."""
    await register(client)
    created = await _upload(client, "timed.jpg", make_jpeg(taken_at=datetime(2026, 8, 8, 12, 0)))
    assert created[0]["lat"] is None
    assert created[0]["taken_at"] is not None


async def test_a_located_photo_without_a_timestamp_is_accepted(client):
    """Neither half is mandatory; the clock falls back to the upload time."""
    await register(client)
    response = await client.post(
        "/api/images", files=[("files", ("located.jpg", make_jpeg(*BKK), "image/jpeg"))]
    )
    assert response.status_code == 201, response.text


async def test_a_batch_mixing_located_and_unlocated_photos_is_kept_whole(client):
    """A phone selection is many photos at once, and only some carry a fix."""
    await register(client)
    response = await client.post(
        "/api/images",
        files=[
            ("files", ("located.jpg", make_jpeg(*BKK, color=(1, 1, 1)), "image/jpeg")),
            ("files", ("no-gps.jpg", make_jpeg(color=(2, 2, 2)), "image/jpeg")),
        ],
    )
    assert response.status_code == 201, response.text
    created = response.json()
    assert len(created) == 2
    assert sorted(image["lat"] is None for image in created) == [False, True]


async def test_a_batch_comes_back_in_the_order_it_was_sent(client):
    """The response is how a caller learns the ids of what it just uploaded.

    Postgres answers an unordered `id IN (...)` in whatever order suits it, so
    pairing the rows with the files they came from shuffled them — the second
    photo's place ending up on the third.

    This pins the contract rather than catching the bug: the suite runs on
    sqlite, which returns rowid order whether or not anything asked it to. The
    reorder only shows against a real Postgres.
    """
    await register(client)
    times = [datetime(2026, 8, 8, hour, 0, tzinfo=UTC) for hour in (9, 12, 15)]
    response = await client.post(
        "/api/images",
        files=[
            ("files", (f"{i}.jpg", make_jpeg(taken_at=taken, color=(i, i, i)), "image/jpeg"))
            for i, taken in enumerate(times, start=1)
        ],
    )
    assert response.status_code == 201, response.text
    assert [image["taken_at"] for image in response.json()] == [
        taken.isoformat().replace("+00:00", "Z") for taken in times
    ]


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
