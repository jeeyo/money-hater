"""The place the user picked for a photo decides which stop it is in.

Two receipts photographed half an hour apart, from two shops a couple of
hundred metres apart on the same street, are two stops — but nothing in the
photos says so. Neither carries a fix, both fall inside the gap, and both
addresses sit inside the distance threshold, so before the place was allowed
to decide they came out as one stop under whichever name was counted first.
"""

from datetime import UTC, datetime

import sqlalchemy as sa

import app.services.analysis as analysis_mod
from app.models import Expense, Image, Place, User, Visit
from app.services.analysis import run_image_analysis
from app.services.clustering import recluster_user
from app.services.vision import ReceiptData, VisionResult
from tests.conftest import register
from tests.util import make_jpeg

# Two doors down from each other in Chinatown, Singapore: ~200m apart, which
# is inside visit_max_distance_m and is the whole point.
LUCKIN = (1.2833, 103.8437)
GUNKEE = (1.2846, 103.8451)


async def _analyzed(
    client, db_sessionmaker, name: str, taken: datetime, color=(200, 60, 60)
) -> int:
    """A photo with a clock and nothing else — a receipt off a phone camera."""
    response = await client.post(
        "/api/images",
        files=[("files", (name, make_jpeg(taken_at=taken, color=color), "image/jpeg"))],
    )
    assert response.status_code == 201, response.text
    created = response.json()[0]
    async with db_sessionmaker() as db:
        await run_image_analysis(db, created["id"])
    return created["id"]


async def _a_place(db_sessionmaker, name: str, coords: tuple[float, float]) -> int:
    async with db_sessionmaker() as db:
        place = Place(
            google_place_id=f"ChIJ-{name}",
            name=name,
            formatted_address=f"{name}, Singapore",
            lat=coords[0],
            lng=coords[1],
            types=["restaurant"],
        )
        db.add(place)
        await db.commit()
        return place.id


def _at(hour: int, minute: int) -> datetime:
    return datetime(2026, 8, 3, hour, minute, tzinfo=UTC)


async def _the_two_receipts(client, db_sessionmaker) -> tuple[int, int, int, int]:
    coffee = await _analyzed(client, db_sessionmaker, "coffee.jpg", _at(0, 22))
    claypot = await _analyzed(client, db_sessionmaker, "claypot.jpg", _at(0, 56), color=(2, 2, 2))
    luckin = await _a_place(db_sessionmaker, "luckin coffee", LUCKIN)
    gunkee = await _a_place(db_sessionmaker, "GUNKEE CLAYPOT", GUNKEE)

    for image_id, place_id in ((coffee, luckin), (claypot, gunkee)):
        response = await client.patch(f"/api/images/{image_id}", json={"place_id": place_id})
        assert response.status_code == 200, response.text
    return coffee, claypot, luckin, gunkee


async def test_two_receipts_two_places_two_stops(client, db_sessionmaker):
    await register(client)
    coffee, claypot, luckin, gunkee = await _the_two_receipts(client, db_sessionmaker)

    async with db_sessionmaker() as db:
        visits = (await db.execute(sa.select(Visit).order_by(Visit.started_at))).scalars().all()
        assert [v.place_id for v in visits] == [luckin, gunkee]
        assert (await db.get(Image, coffee)).visit_id == visits[0].id
        assert (await db.get(Image, claypot)).visit_id == visits[1].id


async def test_each_stop_is_named_after_its_own_receipt(client, db_sessionmaker):
    """The visible bug: the claypot was filed under the coffee shop."""
    await register(client)
    coffee, claypot, luckin, gunkee = await _the_two_receipts(client, db_sessionmaker)

    async with db_sessionmaker() as db:
        claypot_visit = await db.get(Visit, (await db.get(Image, claypot)).visit_id)
        assert claypot_visit.place_id == gunkee


async def test_a_photo_of_the_food_follows_its_receipt(client, db_sessionmaker):
    """A photo with neither a fix nor a place has only the clock to go on.

    Taken at the claypot table, it must land on the claypot stop rather than
    being swept into the coffee an hour earlier along with everything else.
    """
    await register(client)
    coffee, claypot, luckin, gunkee = await _the_two_receipts(client, db_sessionmaker)
    dish = await _analyzed(client, db_sessionmaker, "dish.jpg", _at(0, 56), color=(9, 9, 9))

    async with db_sessionmaker() as db:
        assert (await db.get(Image, dish)).visit_id == (await db.get(Image, claypot)).visit_id
        assert (await db.get(Image, dish)).place_id is None, "it is still not a photo of a place"


async def test_the_split_survives_reclustering(client, db_sessionmaker):
    """Every upload re-runs this, so it has to be the steady state, not a nudge."""
    await register(client)
    me = (await client.get("/api/auth/me")).json()
    coffee, claypot, luckin, gunkee = await _the_two_receipts(client, db_sessionmaker)

    async with db_sessionmaker() as db:
        await recluster_user(db, await db.get(User, me["id"]))

    async with db_sessionmaker() as db:
        visits = (await db.execute(sa.select(Visit).order_by(Visit.started_at))).scalars().all()
        assert [v.place_id for v in visits] == [luckin, gunkee]


async def test_correcting_a_receipt_moves_it_out_of_the_wrong_stop(client, db_sessionmaker):
    """What the user does when they see the mistake: name the right place.

    The photo has to leave the stop it was wrongly in, not just relabel it.
    """
    await register(client)
    coffee, claypot, luckin, gunkee = await _the_two_receipts(client, db_sessionmaker)

    # Second thoughts: the claypot receipt was actually from the coffee shop
    await client.patch(f"/api/images/{claypot}", json={"place_id": luckin})

    async with db_sessionmaker() as db:
        visits = (await db.execute(sa.select(Visit))).scalars().all()
        assert [v.place_id for v in visits] == [luckin], "one place, one stop"
        assert (await db.get(Image, coffee)).visit_id == (await db.get(Image, claypot)).visit_id


async def test_the_expense_follows_the_photo(client, db_sessionmaker, monkeypatch):
    """A receipt's money belongs to the stop the receipt is filed under.

    Splitting the stop and leaving the money on the old one would move the
    total to the wrong shop — the number the day's header adds up.
    """

    async def fake_vision(path, mime):
        return VisionResult(
            kind="receipt",
            caption="Receipt",
            labels=["receipt"],
            receipt=ReceiptData(merchant="A shop", currency="SGD", total=86.21),
        )

    monkeypatch.setattr(analysis_mod, "analyze_image_content", fake_vision)

    await register(client)
    coffee, claypot, luckin, gunkee = await _the_two_receipts(client, db_sessionmaker)

    async with db_sessionmaker() as db:
        for image_id in (coffee, claypot):
            expense = await db.scalar(sa.select(Expense).where(Expense.image_id == image_id))
            assert expense is not None
            assert expense.visit_id == (await db.get(Image, image_id)).visit_id
