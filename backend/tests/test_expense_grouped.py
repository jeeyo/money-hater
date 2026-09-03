"""The "All expenses" list, most recent first and paginated a page at a time."""

from app.models import Place
from tests.conftest import register

BKK = (13.7563, 100.5018)


async def _a_place(db_sessionmaker, name: str) -> int:
    async with db_sessionmaker() as db:
        place = Place(
            google_place_id=f"ChIJ-{name}",
            name=name,
            formatted_address=None,
            lat=BKK[0],
            lng=BKK[1],
            types=None,
        )
        db.add(place)
        await db.commit()
        return place.id


async def _spend(client, total: str, merchant: str, place_id: int | None = None, spent_at=None):
    body = {"total": total, "currency": "THB", "merchant": merchant}
    if place_id is not None:
        body["place_id"] = place_id
    if spent_at is not None:
        body["spent_at"] = spent_at
    response = await client.post("/api/expenses", json=body)
    assert response.status_code == 201, response.text
    return response.json()


async def test_expenses_are_ordered_newest_first_regardless_of_place(client, db_sessionmaker):
    """A place visited twice shouldn't pull its older visit ahead of a more
    recent expense somewhere else — the list is one strict date order."""
    await register(client)
    place_id = await _a_place(db_sessionmaker, "Kopi 1930")

    await _spend(client, "60.00", "Coffee", place_id, "2026-08-10T08:00:00Z")
    await _spend(client, "40.00", "Tip", spent_at="2026-08-11T09:00:00Z")
    await _spend(client, "180.00", "Lunch", place_id, "2026-08-12T12:00:00Z")

    page = (await client.get("/api/expenses/grouped")).json()
    assert page["total"] == 3
    assert page["total_pages"] == 1
    amounts = [e["total_minor"] for e in page["expenses"]]
    assert amounts == [18000, 4000, 6000]


async def test_page_includes_the_expenses_place(client, db_sessionmaker):
    await register(client)
    place_id = await _a_place(db_sessionmaker, "Kopi 1930")
    await _spend(client, "60.00", "Coffee", place_id, "2026-08-10T08:00:00Z")

    page = (await client.get("/api/expenses/grouped")).json()
    assert page["expenses"][0]["place"]["id"] == place_id


async def test_pagination_splits_over_pages(client, db_sessionmaker):
    await register(client)
    for i in range(17):
        await _spend(client, "10.00", "x", spent_at=f"2026-08-{i + 1:02d}T08:00:00Z")

    first = (await client.get("/api/expenses/grouped", params={"page": 1})).json()
    assert first["total"] == 17
    assert first["total_pages"] == 2
    assert len(first["expenses"]) == 15

    second = (await client.get("/api/expenses/grouped", params={"page": 2})).json()
    assert len(second["expenses"]) == 2

    first_ids = {e["id"] for e in first["expenses"]}
    second_ids = {e["id"] for e in second["expenses"]}
    assert first_ids.isdisjoint(second_ids)


async def test_grouped_respects_needs_review_filter(client, db_sessionmaker):
    await register(client)
    place_id = await _a_place(db_sessionmaker, "Kopi 1930")
    await _spend(client, "60.00", "Coffee", place_id, "2026-08-10T08:00:00Z")

    page = (
        await client.get("/api/expenses/grouped", params={"needs_review": "true"})
    ).json()
    assert page["expenses"] == []
    assert page["total"] == 0
