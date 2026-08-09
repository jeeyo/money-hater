"""Correcting the place a photo was taken at.

Reverse geocoding answers with the nearest match to the GPS fix, which indoors
or on a dense street is regularly the shop next door. Re-analyzing asks the
same question and gets the same answer, so the user has to be able to say.
"""

from datetime import UTC, datetime

import sqlalchemy as sa

from app.models import Image, Place, Visit
from app.services.analysis import run_image_analysis
from tests.conftest import register
from tests.util import make_jpeg

BKK = (13.7563, 100.5018)


async def _a_photo(client, db_sessionmaker) -> int:
    created = (
        await client.post(
            "/api/images",
            files=[
                (
                    "files",
                    (
                        "a.jpg",
                        make_jpeg(*BKK, taken_at=datetime(2026, 8, 8, 12, 0, tzinfo=UTC)),
                        "image/jpeg",
                    ),
                )
            ],
        )
    ).json()
    async with db_sessionmaker() as db:
        await run_image_analysis(db, created[0]["id"])
    return created[0]["id"]


async def _a_place(db_sessionmaker, name="Kopi 1930") -> int:
    async with db_sessionmaker() as db:
        place = Place(
            google_place_id=f"ChIJ-{name}",
            name=name,
            formatted_address="1 St Andrew's Rd",
            lat=BKK[0],
            lng=BKK[1],
            types=["cafe"],
        )
        db.add(place)
        await db.commit()
        return place.id


async def test_setting_a_photos_place(client, db_sessionmaker):
    await register(client)
    image_id = await _a_photo(client, db_sessionmaker)
    place_id = await _a_place(db_sessionmaker)

    response = await client.patch(f"/api/images/{image_id}", json={"place_id": place_id})
    assert response.status_code == 200, response.text
    assert response.json()["place"]["name"] == "Kopi 1930"

    async with db_sessionmaker() as db:
        assert (await db.get(Image, image_id)).place_id == place_id


async def test_the_stop_is_renamed_to_match(client, db_sessionmaker):
    """A stop is named after the places of its photos, so it has to follow."""
    await register(client)
    image_id = await _a_photo(client, db_sessionmaker)
    place_id = await _a_place(db_sessionmaker, name="Twenty Eight Cafe")

    await client.patch(f"/api/images/{image_id}", json={"place_id": place_id})

    async with db_sessionmaker() as db:
        visit = await db.scalar(sa.select(Visit))
        assert visit is not None and visit.place_id == place_id


async def test_the_stop_keeps_its_identity(client, db_sessionmaker):
    """Only the place changed, so the stop must not be torn down and rebuilt.

    A new id for the same stop reaches the UI as a different card: whatever
    the user had open on it closes underneath them.
    """
    await register(client)
    image_id = await _a_photo(client, db_sessionmaker)
    place_id = await _a_place(db_sessionmaker)

    async with db_sessionmaker() as db:
        before = (await db.scalar(sa.select(Visit))).id

    await client.patch(f"/api/images/{image_id}", json={"place_id": place_id})

    async with db_sessionmaker() as db:
        visit = await db.scalar(sa.select(Visit))
        assert visit.id == before


async def test_a_stop_the_user_edited_is_left_alone(client, db_sessionmaker):
    """Pinned means the user has had their say about this stop."""
    await register(client)
    image_id = await _a_photo(client, db_sessionmaker)
    place_id = await _a_place(db_sessionmaker)

    async with db_sessionmaker() as db:
        visit = await db.scalar(sa.select(Visit))
        visit.pinned = True
        named_place = visit.place_id
        await db.commit()

    await client.patch(f"/api/images/{image_id}", json={"place_id": place_id})

    async with db_sessionmaker() as db:
        visit = await db.scalar(sa.select(Visit))
        assert visit.place_id == named_place
        assert (await db.get(Image, image_id)).place_id == place_id, (
            "the photo's own place is still the user's to correct"
        )


async def test_a_place_can_be_removed(client, db_sessionmaker):
    await register(client)
    image_id = await _a_photo(client, db_sessionmaker)
    place_id = await _a_place(db_sessionmaker)
    await client.patch(f"/api/images/{image_id}", json={"place_id": place_id})

    response = await client.patch(f"/api/images/{image_id}", json={"place_id": None})
    assert response.status_code == 200, response.text
    assert response.json()["place"] is None


async def test_an_empty_patch_changes_nothing(client, db_sessionmaker):
    """Omitted is not the same as null — only a sent field is applied."""
    await register(client)
    image_id = await _a_photo(client, db_sessionmaker)
    place_id = await _a_place(db_sessionmaker)
    await client.patch(f"/api/images/{image_id}", json={"place_id": place_id})

    response = await client.patch(f"/api/images/{image_id}", json={})
    assert response.status_code == 200, response.text
    assert response.json()["place"]["id"] == place_id


async def test_an_unknown_place_is_a_404(client, db_sessionmaker):
    await register(client)
    image_id = await _a_photo(client, db_sessionmaker)

    response = await client.patch(f"/api/images/{image_id}", json={"place_id": 9999})
    assert response.status_code == 404


async def test_editing_someone_elses_photo_is_a_404(client, db_sessionmaker):
    await register(client, email="alice@example.com")
    image_id = await _a_photo(client, db_sessionmaker)
    place_id = await _a_place(db_sessionmaker)

    await client.post("/api/auth/logout")
    await register(client, email="bob@example.com")
    response = await client.patch(f"/api/images/{image_id}", json={"place_id": place_id})
    assert response.status_code == 404
