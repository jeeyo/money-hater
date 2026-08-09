"""What was spent at a place, receipt or no receipt.

A place is not one purchase. The same cafe can hold a receipt photographed at
the counter, a cash tip typed in afterwards, and a second round later the same
day — and a screenshot of a receipt, which carries no GPS, still has to reach
the stop it was paid at.
"""

from datetime import UTC, datetime

import sqlalchemy as sa

import app.services.analysis as analysis_mod
from app.models import Expense, Image, Place, Visit
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


async def _spend(client, place_id: int | None, total: str, merchant: str) -> dict:
    body = {"total": total, "currency": "THB", "merchant": merchant}
    if place_id is not None:
        body["place_id"] = place_id
    response = await client.post("/api/expenses", json=body)
    assert response.status_code == 201, response.text
    return response.json()


async def test_an_expense_can_name_a_place_with_no_receipt_at_all(client, db_sessionmaker):
    """Cash, a tip, a fare — spending that never produced a photo."""
    await register(client)
    place_id = await _a_place(db_sessionmaker)

    expense = await _spend(client, place_id, "60.00", "Kopi 1930")
    assert expense["image_id"] is None
    assert expense["source"] == "manual"
    assert expense["place"]["id"] == place_id
    assert expense["place"]["name"] == "Kopi 1930"


async def test_a_place_named_on_an_expense_fills_in_the_merchant(client, db_sessionmaker):
    """So the picked place and the typed name group together, not apart."""
    await register(client)
    place_id = await _a_place(db_sessionmaker)

    response = await client.post(
        "/api/expenses", json={"total": "60.00", "currency": "THB", "place_id": place_id}
    )
    assert response.status_code == 201, response.text
    assert response.json()["merchant"] == "Kopi 1930"


async def test_one_place_holds_many_expenses(client, db_sessionmaker):
    await register(client)
    place_id = await _a_place(db_sessionmaker)

    first = await _spend(client, place_id, "60.00", "Coffee")
    second = await _spend(client, place_id, "180.00", "Lunch")
    third = await _spend(client, place_id, "40.00", "Tip")

    listed = (await client.get("/api/expenses")).json()
    assert {e["id"] for e in listed} == {first["id"], second["id"], third["id"]}
    assert all(e["place"]["id"] == place_id for e in listed)


async def test_a_place_holds_receipts_and_hand_entered_spending_together(
    client, db_sessionmaker, monkeypatch
):
    await register(client)
    place_id = await _a_place(db_sessionmaker)
    created = (
        await client.post(
            "/api/images",
            files=[("files", ("r.jpg", make_jpeg(*BKK, color=(9, 9, 9)), "image/jpeg"))],
        )
    ).json()

    async def fake_vision(path, mime):
        return RECEIPT_RESULT

    monkeypatch.setattr(analysis_mod, "analyze_image_content", fake_vision)
    async with db_sessionmaker() as db:
        await run_image_analysis(db, created[0]["id"])

    receipt = (await client.get("/api/expenses")).json()[0]
    await client.patch(f"/api/expenses/{receipt['id']}", json={"place_id": place_id})
    await _spend(client, place_id, "40.00", "Tip")

    listed = (await client.get("/api/expenses")).json()
    assert len(listed) == 2
    assert {e["place"]["id"] for e in listed} == {place_id}
    assert sorted(e["source"] for e in listed) == ["manual", "receipt"]


async def test_a_receipt_with_no_gps_still_reaches_its_stop(
    client, db_sessionmaker, monkeypatch
):
    """A screenshot has no fix, but it was taken during the stop it paid for."""
    await register(client)

    async def upload(name, data):
        created = (
            await client.post("/api/images", files=[("files", (name, data, "image/jpeg"))])
        ).json()
        async with db_sessionmaker() as db:
            await run_image_analysis(db, created[0]["id"])
        return created[0]["id"]

    async def no_receipt(path, mime):
        return None

    monkeypatch.setattr(analysis_mod, "analyze_image_content", no_receipt)
    await upload("lunch.jpg", make_jpeg(*BKK, taken_at=datetime(2026, 8, 8, 13, 0, tzinfo=UTC)))

    async def fake_vision(path, mime):
        return RECEIPT_RESULT

    monkeypatch.setattr(analysis_mod, "analyze_image_content", fake_vision)
    screenshot = await upload(
        "receipt.png",
        make_jpeg(taken_at=datetime(2026, 8, 8, 13, 5, tzinfo=UTC), color=(2, 2, 2)),
    )

    async with db_sessionmaker() as db:
        visit = await db.scalar(sa.select(Visit))
        image = await db.get(Image, screenshot)
        assert image.visit_id == visit.id
        expense = await db.scalar(sa.select(Expense).where(Expense.image_id == screenshot))
        assert expense is not None
        assert expense.visit_id == visit.id, "the spend belongs to the stop it was paid at"

    day = (
        await client.get("/api/timeline", params={"date": "2026-08-08", "tz_offset_minutes": 0})
    ).json()
    assert day["visits"][0]["spend"]["base_total_minor"] == 34550
