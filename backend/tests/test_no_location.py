"""A photo with no location of its own is still an itinerary entry.

A screenshot of a receipt carries no GPS, and refusing it threw away the record
of what was spent. It is accepted and placed by its clock instead: it joins the
stop it was taken during, and naming a place for it gives it the coordinates it
never had. What it never does is shape a stop — the window, the centroid and
the name belong to the photos that knew where they were.
"""

from datetime import UTC, datetime

import sqlalchemy as sa

from app.models import Image, Place, User, Visit
from app.services.analysis import run_image_analysis
from app.services.clustering import recluster_user
from tests.conftest import register
from tests.util import make_jpeg

BKK = (13.7563, 100.5018)


async def _upload(client, name: str, data: bytes) -> dict:
    response = await client.post("/api/images", files=[("files", (name, data, "image/jpeg"))])
    assert response.status_code == 201, response.text
    return response.json()[0]


async def _analyzed(client, db_sessionmaker, name: str, data: bytes) -> dict:
    created = await _upload(client, name, data)
    async with db_sessionmaker() as db:
        await run_image_analysis(db, created["id"])
    return created


async def _a_place(db_sessionmaker, name="Kopi 1930", coords=BKK) -> int:
    async with db_sessionmaker() as db:
        place = Place(
            google_place_id=f"ChIJ-{name}",
            name=name,
            formatted_address="1 St Andrew's Rd",
            lat=coords[0],
            lng=coords[1],
            types=["cafe"],
        )
        db.add(place)
        await db.commit()
        return place.id


async def test_upload_records_the_location_it_read(client):
    """Deriving it again in the worker meant a failed analysis rolled it back
    and stranded the photo."""
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


async def test_a_photo_with_no_location_analyzes_normally(client, db_sessionmaker):
    """It used to be marked failed with nothing wrong with it but its EXIF."""
    await register(client)
    created = await _analyzed(
        client,
        db_sessionmaker,
        "receipt.jpg",
        make_jpeg(taken_at=datetime(2026, 8, 7, 18, 31, tzinfo=UTC)),
    )

    async with db_sessionmaker() as db:
        image = await db.get(Image, created["id"])
        assert image.status == "analyzed"
        assert image.error is None
        assert image.thumb_path is not None, "it is a photo like any other"


async def test_it_joins_the_stop_it_was_taken_during(client, db_sessionmaker):
    """The receipt was photographed at the table, minutes after the food."""
    await register(client)
    lunch = await _analyzed(
        client,
        db_sessionmaker,
        "lunch.jpg",
        make_jpeg(*BKK, taken_at=datetime(2026, 8, 7, 18, 31, tzinfo=UTC)),
    )
    receipt = await _analyzed(
        client,
        db_sessionmaker,
        "receipt.jpg",
        make_jpeg(taken_at=datetime(2026, 8, 7, 18, 35, tzinfo=UTC), color=(2, 2, 2)),
    )

    async with db_sessionmaker() as db:
        located = await db.get(Image, lunch["id"])
        unlocated = await db.get(Image, receipt["id"])
        assert located.visit_id is not None
        assert unlocated.visit_id == located.visit_id
        assert len((await db.execute(sa.select(Visit))).scalars().all()) == 1


async def test_it_does_not_shape_the_stop_it_joins(client, db_sessionmaker):
    """A stop it helped define would be a stop placed on a guess."""
    await register(client)
    await _analyzed(
        client,
        db_sessionmaker,
        "lunch.jpg",
        make_jpeg(*BKK, taken_at=datetime(2026, 8, 7, 18, 31, tzinfo=UTC)),
    )
    async with db_sessionmaker() as db:
        visit = await db.scalar(sa.select(Visit))
        before = (visit.lat, visit.lng, visit.started_at, visit.ended_at)

    await _analyzed(
        client,
        db_sessionmaker,
        "receipt.jpg",
        make_jpeg(taken_at=datetime(2026, 8, 7, 18, 35, tzinfo=UTC), color=(2, 2, 2)),
    )

    async with db_sessionmaker() as db:
        visit = await db.scalar(sa.select(Visit))
        assert (visit.lat, visit.lng, visit.started_at, visit.ended_at) == before


async def test_one_taken_far_from_any_stop_is_left_unplaced(client, db_sessionmaker):
    """Beyond the gap that would have kept two photos together, it is a guess."""
    await register(client)
    await _analyzed(
        client,
        db_sessionmaker,
        "lunch.jpg",
        make_jpeg(*BKK, taken_at=datetime(2026, 8, 7, 12, 0, tzinfo=UTC)),
    )
    stray = await _analyzed(
        client,
        db_sessionmaker,
        "stray.jpg",
        make_jpeg(taken_at=datetime(2026, 8, 7, 23, 50, tzinfo=UTC), color=(2, 2, 2)),
    )

    async with db_sessionmaker() as db:
        assert (await db.get(Image, stray["id"])).visit_id is None


async def test_an_unplaced_photo_still_shows_on_its_day(client, db_sessionmaker):
    """Off the map, but not out of the log — it is what was spent that day."""
    await register(client)
    stray = await _analyzed(
        client,
        db_sessionmaker,
        "stray.jpg",
        make_jpeg(taken_at=datetime(2026, 8, 7, 23, 50, tzinfo=UTC)),
    )

    response = await client.get("/api/timeline?date=2026-08-07&tz_offset_minutes=0")
    assert response.status_code == 200, response.text
    day = response.json()
    assert [i["id"] for i in day["unassigned_images"]] == [stray["id"]]


async def test_a_day_of_only_unlocated_photos_makes_no_stops(client, db_sessionmaker):
    """With nothing that knows where it was, there is no stop to infer."""
    await register(client)
    first = await _analyzed(
        client,
        db_sessionmaker,
        "one.jpg",
        make_jpeg(taken_at=datetime(2026, 8, 7, 9, 0, tzinfo=UTC), color=(1, 1, 1)),
    )
    second = await _analyzed(
        client,
        db_sessionmaker,
        "two.jpg",
        make_jpeg(taken_at=datetime(2026, 8, 7, 9, 10, tzinfo=UTC), color=(2, 2, 2)),
    )

    async with db_sessionmaker() as db:
        assert (await db.execute(sa.select(Visit))).scalars().all() == []

    day = (await client.get("/api/timeline?date=2026-08-07&tz_offset_minutes=0")).json()
    assert day["visits"] == []
    assert [i["id"] for i in day["unassigned_images"]] == [first["id"], second["id"]]


async def test_naming_a_place_puts_it_on_the_map(client, db_sessionmaker):
    """A place is a real address, so it gives the photo coordinates to be a pin."""
    await register(client)
    created = await _analyzed(
        client,
        db_sessionmaker,
        "receipt.jpg",
        make_jpeg(taken_at=datetime(2026, 8, 7, 18, 31, tzinfo=UTC)),
    )
    place_id = await _a_place(db_sessionmaker)

    response = await client.patch(f"/api/images/{created['id']}", json={"place_id": place_id})
    assert response.status_code == 200, response.text

    async with db_sessionmaker() as db:
        image = await db.get(Image, created["id"])
        assert image.visit_id is not None, "it can be a stop now that it has a location"
        visit = await db.get(Visit, image.visit_id)
        assert (visit.lat, visit.lng) == BKK
        assert visit.place_id == place_id


async def test_a_named_place_survives_reclustering(client, db_sessionmaker):
    """Inference only ever writes which stop a photo is in, never where it was."""
    await register(client)
    me = (await client.get("/api/auth/me")).json()
    created = await _analyzed(
        client,
        db_sessionmaker,
        "receipt.jpg",
        make_jpeg(taken_at=datetime(2026, 8, 7, 18, 31, tzinfo=UTC)),
    )
    place_id = await _a_place(db_sessionmaker)
    await client.patch(f"/api/images/{created['id']}", json={"place_id": place_id})

    async with db_sessionmaker() as db:
        await recluster_user(db, await db.get(User, me["id"]))

    async with db_sessionmaker() as db:
        assert (await db.get(Image, created["id"])).place_id == place_id


async def test_a_manual_stop_assignment_survives_reclustering(client, db_sessionmaker):
    """The user filing a receipt under a stop outranks anything inferred."""
    await register(client)
    me = (await client.get("/api/auth/me")).json()
    await _analyzed(
        client,
        db_sessionmaker,
        "morning.jpg",
        make_jpeg(*BKK, taken_at=datetime(2026, 8, 7, 9, 0, tzinfo=UTC)),
    )
    stray = await _analyzed(
        client,
        db_sessionmaker,
        "stray.jpg",
        make_jpeg(taken_at=datetime(2026, 8, 7, 23, 50, tzinfo=UTC), color=(2, 2, 2)),
    )
    async with db_sessionmaker() as db:
        visit_id = (await db.scalar(sa.select(Visit))).id

    response = await client.post(f"/api/images/{stray['id']}/assign", json={"visit_id": visit_id})
    assert response.status_code == 200, response.text

    async with db_sessionmaker() as db:
        await recluster_user(db, await db.get(User, me["id"]))

    async with db_sessionmaker() as db:
        assert (await db.get(Image, stray["id"])).visit_id == visit_id
