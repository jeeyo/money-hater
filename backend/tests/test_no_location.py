"""A photo with no location is never an itinerary entry.

Upload refuses one outright. The rows that got in before it could recognise a
NaN coordinate are held to the same rule everywhere it matters, so they cannot
keep surfacing on the timeline with no place and today's date on them.
"""

from datetime import UTC, datetime

import sqlalchemy as sa

from app.models import Image, User, Visit
from app.services.analysis import run_image_analysis
from app.services.clustering import recluster_user
from tests.conftest import register
from tests.util import make_jpeg

BKK = (13.7563, 100.5018)


async def _upload(client, name: str, data: bytes) -> dict:
    response = await client.post("/api/images", files=[("files", (name, data, "image/jpeg"))])
    assert response.status_code == 201, response.text
    return response.json()[0]


async def _legacy_row_without_location(db_sessionmaker, user_id: int, when: datetime) -> int:
    """An image as the old code left one: accepted, then analyzed to nothing.

    EXIF was applied inside the analysis transaction, so a failure rolled the
    location back out and left the row with none.
    """
    async with db_sessionmaker() as db:
        image = Image(
            user_id=user_id,
            sha256="deadbeef" * 8,
            original_path="/nowhere/legacy.jpg",
            mime="image/jpeg",
            size_bytes=1,
            status="failed",
            error="Out of range float values are not JSON compliant: nan",
            taken_at=when,
        )
        db.add(image)
        await db.commit()
        return image.id


async def test_upload_records_the_location_it_checked(client):
    """The check already read it; deriving it again in the worker meant a
    failed analysis rolled it back and stranded the photo."""
    await register(client)
    taken = datetime(2026, 8, 7, 18, 31, tzinfo=UTC)
    created = await _upload(client, "a.jpg", make_jpeg(*BKK, taken_at=taken))

    assert created["lat"] is not None and created["lng"] is not None
    assert created["status"] == "pending", "before the worker has run at all"
    assert created["taken_at"] is not None


async def test_a_failed_analysis_keeps_the_photo_where_it_was_taken(client, db_sessionmaker):
    await register(client)
    taken = datetime(2026, 8, 7, 18, 31, tzinfo=UTC)
    created = await _upload(client, "a.jpg", make_jpeg(*BKK, taken_at=taken))

    async with db_sessionmaker() as db:
        image = await db.get(Image, created["id"])
        image.status = "failed"
        image.error = "vision provider was down"
        await db.commit()

    response = await client.get("/api/timeline?date=2026-08-07&tz_offset_minutes=0")
    assert response.status_code == 200
    day = response.json()
    shown = [i["id"] for i in day["unassigned_images"]] + [
        i["id"] for v in day["visits"] for i in v["images"]
    ]
    assert created["id"] in shown, "a transient failure must not lose the photo"


async def test_a_photo_with_no_location_stays_off_the_timeline(client, db_sessionmaker):
    await register(client)
    me = (await client.get("/api/auth/me")).json()
    when = datetime(2026, 8, 7, 20, 19, tzinfo=UTC)
    image_id = await _legacy_row_without_location(db_sessionmaker, me["id"], when)

    response = await client.get("/api/timeline?date=2026-08-07&tz_offset_minutes=0")
    assert response.status_code == 200, response.text
    day = response.json()
    assert [i["id"] for i in day["unassigned_images"]] == []
    assert image_id not in [i["id"] for v in day["visits"] for i in v["images"]]


async def test_a_photo_with_no_location_is_never_clustered_into_a_stop(client, db_sessionmaker):
    """Left in, it would join whichever stop it fell next to in time and
    inherit a place it was never at."""
    await register(client)
    me = (await client.get("/api/auth/me")).json()
    taken = datetime(2026, 8, 7, 18, 31, tzinfo=UTC)
    created = await _upload(client, "a.jpg", make_jpeg(*BKK, taken_at=taken))
    async with db_sessionmaker() as db:
        await run_image_analysis(db, created["id"])

    # Minutes later, so it would land in the same cluster if it were eligible
    stray = await _legacy_row_without_location(
        db_sessionmaker, me["id"], datetime(2026, 8, 7, 18, 35, tzinfo=UTC)
    )

    async with db_sessionmaker() as db:
        await recluster_user(db, await db.get(User, me["id"]))

    async with db_sessionmaker() as db:
        assert (await db.get(Image, stray)).visit_id is None
        visits = (await db.execute(sa.select(Visit))).scalars().all()
        assert len(visits) == 1, "only the photo that has a location makes a stop"


async def test_reanalyzing_one_says_what_is_actually_wrong(client, db_sessionmaker, tmp_path):
    """Not "float values are not JSON compliant" — the real reason."""
    await register(client)
    me = (await client.get("/api/auth/me")).json()
    image_id = await _legacy_row_without_location(
        db_sessionmaker, me["id"], datetime(2026, 8, 7, 20, 19, tzinfo=UTC)
    )
    # Point it at a real file with no GPS, as re-analysis would read it
    path = tmp_path / "legacy.jpg"
    path.write_bytes(make_jpeg(color=(3, 3, 3)))
    async with db_sessionmaker() as db:
        image = await db.get(Image, image_id)
        image.original_path = str(path)
        await db.commit()
        await run_image_analysis(db, image_id)

    async with db_sessionmaker() as db:
        image = await db.get(Image, image_id)
        assert image.status == "failed"
        assert "location" in image.error.lower()
