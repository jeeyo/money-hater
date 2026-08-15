"""The "All expenses" list, sectioned by place and paginated over groups."""

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


async def test_expenses_at_the_same_place_are_grouped(client, db_sessionmaker):
    await register(client)
    place_id = await _a_place(db_sessionmaker, "Kopi 1930")

    await _spend(client, "60.00", "Coffee", place_id, "2026-08-10T08:00:00Z")
    await _spend(client, "180.00", "Lunch", place_id, "2026-08-11T12:00:00Z")
    await _spend(client, "40.00", "Tip", spent_at="2026-08-12T09:00:00Z")  # no resolved place

    page = (await client.get("/api/expenses/grouped")).json()
    assert page["total_groups"] == 2
    assert page["total_pages"] == 1

    by_place = {g["place"]["id"] if g["place"] else None: g for g in page["groups"]}
    assert len(by_place[place_id]["expenses"]) == 2
    assert by_place[None]["place"] is None
    assert len(by_place[None]["expenses"]) == 1

    # Newest first within the group
    amounts = [e["total_minor"] for e in by_place[place_id]["expenses"]]
    assert amounts == [18000, 6000]


async def test_groups_ordered_by_most_recent_visit(client, db_sessionmaker):
    await register(client)
    old_place = await _a_place(db_sessionmaker, "Old Cafe")
    new_place = await _a_place(db_sessionmaker, "New Cafe")

    await _spend(client, "10.00", "x", old_place, "2026-08-01T08:00:00Z")
    await _spend(client, "10.00", "x", new_place, "2026-08-14T08:00:00Z")
    # An earlier second visit to the old place shouldn't bump it past the new one
    await _spend(client, "10.00", "x", old_place, "2026-08-02T08:00:00Z")

    page = (await client.get("/api/expenses/grouped")).json()
    assert [g["place"]["id"] for g in page["groups"]] == [new_place, old_place]


async def test_grouped_pagination_splits_over_pages(client, db_sessionmaker):
    await register(client)
    for i in range(17):
        place_id = await _a_place(db_sessionmaker, f"Place {i}")
        await _spend(client, "10.00", "x", place_id, f"2026-08-{i + 1:02d}T08:00:00Z")

    first = (await client.get("/api/expenses/grouped", params={"page": 1})).json()
    assert first["total_groups"] == 17
    assert first["total_pages"] == 2
    assert len(first["groups"]) == 15

    second = (await client.get("/api/expenses/grouped", params={"page": 2})).json()
    assert len(second["groups"]) == 2

    first_ids = {g["place"]["id"] for g in first["groups"]}
    second_ids = {g["place"]["id"] for g in second["groups"]}
    assert first_ids.isdisjoint(second_ids)


async def test_grouped_respects_needs_review_filter(client, db_sessionmaker):
    await register(client)
    place_id = await _a_place(db_sessionmaker, "Kopi 1930")
    await _spend(client, "60.00", "Coffee", place_id, "2026-08-10T08:00:00Z")

    page = (
        await client.get("/api/expenses/grouped", params={"needs_review": "true"})
    ).json()
    assert page["groups"] == []
    assert page["total_groups"] == 0
