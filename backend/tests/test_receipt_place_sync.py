"""The place on a receipt photo answers for the money read off it.

A receipt regularly arrives with no usable place: a screenshot carries no GPS,
and indoors a fix reverse-geocodes to nothing at all. The user fixes that on
the photo, where the picker is — and the expense, which has no place of its
own, has to follow rather than sit unplaced next to a photo that knows better.
"""

from datetime import UTC, datetime

import sqlalchemy as sa

import app.services.analysis as analysis_mod
from app.models import Expense, Image, Place
from app.services.analysis import run_image_analysis
from tests.conftest import register
from tests.test_receipts import RECEIPT_RESULT
from tests.util import make_jpeg

BKK = (13.7563, 100.5018)


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


async def _a_receipt_photo(client, db_sessionmaker, monkeypatch, **jpeg) -> int:
    async def fake_vision(path, mime):
        return RECEIPT_RESULT

    monkeypatch.setattr(analysis_mod, "analyze_image_content", fake_vision)
    created = (
        await client.post(
            "/api/images",
            files=[("files", ("receipt.jpg", make_jpeg(**jpeg), "image/jpeg"))],
        )
    ).json()
    async with db_sessionmaker() as db:
        await run_image_analysis(db, created[0]["id"])
    return created[0]["id"]


async def _expense(db_sessionmaker) -> Expense:
    async with db_sessionmaker() as db:
        return await db.scalar(sa.select(Expense))


async def test_naming_the_photos_place_places_the_expense(client, db_sessionmaker, monkeypatch):
    await register(client)
    image_id = await _a_receipt_photo(
        client, db_sessionmaker, monkeypatch, taken_at=datetime(2026, 8, 8, 13, 0, tzinfo=UTC)
    )
    assert (await _expense(db_sessionmaker)).place_id is None
    place_id = await _a_place(db_sessionmaker)

    await client.patch(f"/api/images/{image_id}", json={"place_id": place_id})

    listed = (await client.get("/api/expenses")).json()
    assert listed[0]["place"]["id"] == place_id
    # The receipt's own merchant text is what was printed on it; a place does
    # not get to overwrite that.
    assert listed[0]["merchant"] == RECEIPT_RESULT.receipt.merchant


async def test_a_place_picked_on_the_expense_is_not_overwritten(
    client, db_sessionmaker, monkeypatch
):
    """The user has already answered this question on the money itself."""
    await register(client)
    image_id = await _a_receipt_photo(
        client, db_sessionmaker, monkeypatch, taken_at=datetime(2026, 8, 8, 13, 0, tzinfo=UTC)
    )
    theirs = await _a_place(db_sessionmaker, name="Sarnies")
    other = await _a_place(db_sessionmaker, name="The shop next door")
    expense = await _expense(db_sessionmaker)
    await client.patch(f"/api/expenses/{expense.id}", json={"place_id": theirs})

    await client.patch(f"/api/images/{image_id}", json={"place_id": other})

    assert (await _expense(db_sessionmaker)).place_id == theirs


async def test_correcting_the_photo_moves_the_place_it_had_handed_over(
    client, db_sessionmaker, monkeypatch
):
    """The expense is still carrying the photo's answer, so it gets the new one."""
    await register(client)
    image_id = await _a_receipt_photo(
        client, db_sessionmaker, monkeypatch, taken_at=datetime(2026, 8, 8, 13, 0, tzinfo=UTC)
    )
    wrong = await _a_place(db_sessionmaker, name="Next door")
    right = await _a_place(db_sessionmaker, name="Kopi 1930")

    await client.patch(f"/api/images/{image_id}", json={"place_id": wrong})
    assert (await _expense(db_sessionmaker)).place_id == wrong
    await client.patch(f"/api/images/{image_id}", json={"place_id": right})

    assert (await _expense(db_sessionmaker)).place_id == right


async def test_clearing_the_photos_place_leaves_the_expense_alone(
    client, db_sessionmaker, monkeypatch
):
    """Taking the name off a photo is not a claim that the money was nowhere."""
    await register(client)
    image_id = await _a_receipt_photo(
        client, db_sessionmaker, monkeypatch, taken_at=datetime(2026, 8, 8, 13, 0, tzinfo=UTC)
    )
    place_id = await _a_place(db_sessionmaker)
    await client.patch(f"/api/images/{image_id}", json={"place_id": place_id})

    await client.patch(f"/api/images/{image_id}", json={"place_id": None})

    assert (await _expense(db_sessionmaker)).place_id == place_id


async def test_reanalysis_hands_over_a_place_resolved_late(
    client, db_sessionmaker, monkeypatch
):
    """The expense was recorded before anything knew where it was paid."""
    await register(client)
    image_id = await _a_receipt_photo(
        client,
        db_sessionmaker,
        monkeypatch,
        lat=BKK[0],
        lng=BKK[1],
        taken_at=datetime(2026, 8, 8, 13, 0, tzinfo=UTC),
    )
    assert (await _expense(db_sessionmaker)).place_id is None
    place_id = await _a_place(db_sessionmaker)

    async def resolved(db, lat, lng, hint=None):
        return await db.get(Place, place_id)

    monkeypatch.setattr(analysis_mod, "resolve_place", resolved)
    async with db_sessionmaker() as db:
        image = await db.get(Image, image_id)
        assert image.place_id is None
        await run_image_analysis(db, image_id)

    assert (await _expense(db_sessionmaker)).place_id == place_id


async def test_reanalysis_moves_the_place_the_photo_had_handed_over(
    client, db_sessionmaker, monkeypatch
):
    """The photo changed its mind, and the expense was carrying its old answer."""
    await register(client)
    wrong = await _a_place(db_sessionmaker, name="Shop next door")

    def resolves_to(place_id):
        async def resolved(db, lat, lng, hint=None):
            return await db.get(Place, place_id)

        return resolved

    monkeypatch.setattr(analysis_mod, "resolve_place", resolves_to(wrong))
    image_id = await _a_receipt_photo(
        client,
        db_sessionmaker,
        monkeypatch,
        lat=BKK[0],
        lng=BKK[1],
        taken_at=datetime(2026, 8, 8, 13, 0, tzinfo=UTC),
    )
    assert (await _expense(db_sessionmaker)).place_id == wrong

    right = await _a_place(db_sessionmaker, name="Kopi 1930")
    monkeypatch.setattr(analysis_mod, "resolve_place", resolves_to(right))
    async with db_sessionmaker() as db:
        await run_image_analysis(db, image_id)

    assert (await _expense(db_sessionmaker)).place_id == right


async def test_reanalysis_leaves_a_place_picked_on_the_expense_alone(
    client, db_sessionmaker, monkeypatch
):
    await register(client)
    wrong = await _a_place(db_sessionmaker, name="Shop next door")

    async def resolved(db, lat, lng, hint=None):
        return await db.get(Place, wrong)

    monkeypatch.setattr(analysis_mod, "resolve_place", resolved)
    image_id = await _a_receipt_photo(
        client,
        db_sessionmaker,
        monkeypatch,
        lat=BKK[0],
        lng=BKK[1],
        taken_at=datetime(2026, 8, 8, 13, 0, tzinfo=UTC),
    )
    theirs = await _a_place(db_sessionmaker, name="Sarnies")
    expense = await _expense(db_sessionmaker)
    await client.patch(f"/api/expenses/{expense.id}", json={"place_id": theirs})

    async with db_sessionmaker() as db:
        await run_image_analysis(db, image_id)

    assert (await _expense(db_sessionmaker)).place_id == theirs
