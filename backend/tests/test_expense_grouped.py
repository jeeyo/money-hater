"""The "All expenses" list: most recent first, with only back-to-back runs
at the same place (or merchant) collapsed into one section."""

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


async def test_a_back_to_back_run_at_the_same_place_is_grouped(client, db_sessionmaker):
    await register(client)
    place_id = await _a_place(db_sessionmaker, "Kopi 1930")

    await _spend(client, "60.00", "Coffee", place_id, "2026-08-10T08:00:00Z")
    await _spend(client, "180.00", "Lunch", place_id, "2026-08-11T12:00:00Z")
    # No resolved place, and the latest of the three
    await _spend(client, "40.00", "Tip", spent_at="2026-08-12T09:00:00Z")

    page = (await client.get("/api/expenses/grouped")).json()
    assert page["total"] == 3
    assert page["total_pages"] == 1
    assert len(page["groups"]) == 2

    tip_group, place_group = page["groups"]
    assert tip_group["place"] is None
    assert len(tip_group["expenses"]) == 1
    assert place_group["place"]["id"] == place_id
    # Newest first within the group
    amounts = [e["total_minor"] for e in place_group["expenses"]]
    assert amounts == [18000, 6000]


async def test_a_return_visit_gets_its_own_section_instead_of_pulling_the_old_one_forward(
    client, db_sessionmaker
):
    """The bug this guards against: grouping a place globally (rather than by
    adjacency) let an old visit ride along with a much newer one, so it
    showed up out of its actual chronological position — and, worse, a
    page's boundary no longer lined up with a clean slice of time."""
    await register(client)
    old_place = await _a_place(db_sessionmaker, "Old Cafe")
    new_place = await _a_place(db_sessionmaker, "New Cafe")

    await _spend(client, "10.00", "x", old_place, "2026-08-01T08:00:00Z")
    await _spend(client, "10.00", "x", spent_at="2026-08-05T08:00:00Z")  # unrelated, in between
    await _spend(client, "10.00", "x", new_place, "2026-08-14T08:00:00Z")
    await _spend(client, "10.00", "x", old_place, "2026-08-20T08:00:00Z")  # a fresh visit

    page = (await client.get("/api/expenses/grouped")).json()
    assert page["total"] == 4
    # Four ungrouped sections in strict date order — the old visit stays put.
    assert len(page["groups"]) == 4
    ids = [g["place"]["id"] if g["place"] else None for g in page["groups"]]
    assert ids == [old_place, new_place, None, old_place]


async def test_pagination_splits_over_raw_expenses_not_groups(client, db_sessionmaker):
    await register(client)
    for i in range(17):
        place_id = await _a_place(db_sessionmaker, f"Place {i}")
        await _spend(client, "10.00", "x", place_id, f"2026-08-{i + 1:02d}T08:00:00Z")

    first = (await client.get("/api/expenses/grouped", params={"page": 1})).json()
    assert first["total"] == 17
    assert first["total_pages"] == 2
    assert sum(len(g["expenses"]) for g in first["groups"]) == 15

    second = (await client.get("/api/expenses/grouped", params={"page": 2})).json()
    assert sum(len(g["expenses"]) for g in second["groups"]) == 2

    first_ids = {g["place"]["id"] for g in first["groups"]}
    second_ids = {g["place"]["id"] for g in second["groups"]}
    assert first_ids.isdisjoint(second_ids)


async def test_a_back_to_back_run_with_the_same_merchant_text_is_grouped_without_a_place(
    client, db_sessionmaker
):
    """A vending machine or kiosk Google has no entry for still groups by name."""
    await register(client)

    await _spend(client, "40.00", "Turtle vending machine", spent_at="2026-08-11T08:27:00Z")
    await _spend(client, "50.00", "Turtle vending machine", spent_at="2026-08-12T11:19:00Z")
    await _spend(client, "60.00", "Different kiosk", spent_at="2026-08-13T09:00:00Z")

    page = (await client.get("/api/expenses/grouped")).json()
    assert page["total"] == 3
    assert len(page["groups"]) == 2

    kiosk_group, turtle_group = page["groups"]
    assert kiosk_group["merchant"] == "Different kiosk"
    assert len(kiosk_group["expenses"]) == 1
    assert turtle_group["merchant"] == "Turtle vending machine"
    assert turtle_group["place"] is None
    assert len(turtle_group["expenses"]) == 2


async def test_merchant_grouping_ignores_case_and_surrounding_whitespace(client, db_sessionmaker):
    await register(client)
    await _spend(client, "10.00", "Turtle vending machine", spent_at="2026-08-11T08:00:00Z")
    await _spend(client, "10.00", "  turtle VENDING machine  ", spent_at="2026-08-12T08:00:00Z")

    page = (await client.get("/api/expenses/grouped")).json()
    assert page["total"] == 2
    assert len(page["groups"]) == 1
    assert len(page["groups"][0]["expenses"]) == 2


async def test_a_resolved_place_takes_priority_over_matching_merchant_text(
    client, db_sessionmaker
):
    """Once a place is picked, that's the grouping key — not the leftover merchant text."""
    await register(client)
    place_id = await _a_place(db_sessionmaker, "Kiosk")

    await _spend(client, "10.00", "Kiosk", place_id, "2026-08-11T08:00:00Z")
    await _spend(client, "10.00", "Kiosk", spent_at="2026-08-12T08:00:00Z")  # no place resolved

    page = (await client.get("/api/expenses/grouped")).json()
    assert page["total"] == 2
    assert len(page["groups"]) == 2


async def test_grouped_respects_needs_review_filter(client, db_sessionmaker):
    await register(client)
    place_id = await _a_place(db_sessionmaker, "Kopi 1930")
    await _spend(client, "60.00", "Coffee", place_id, "2026-08-10T08:00:00Z")

    page = (
        await client.get("/api/expenses/grouped", params={"needs_review": "true"})
    ).json()
    assert page["groups"] == []
    assert page["total"] == 0
