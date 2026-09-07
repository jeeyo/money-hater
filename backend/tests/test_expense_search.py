"""Searching the expenses list: a term matches the description, the typed
merchant, or the resolved place's name — the three things a row shows."""

from tests.conftest import register
from tests.test_expense_grouped import _a_place, _spend


async def _seed(client, db_sessionmaker):
    place_id = await _a_place(db_sessionmaker, "Menya Itto")
    await _spend(client, "425.00", "Menya Itto", place_id, "2026-08-10T12:00:00Z")
    await _spend(client, "95.00", "Bootleg Coffee Roasters", spent_at="2026-08-11T08:00:00Z")
    await _spend(client, "62.00", "BTS Ari", spent_at="2026-08-12T09:00:00Z")
    return place_id


def _merchants(page):
    return [e["merchant"] for group in page["groups"] for e in group["expenses"]]


async def test_search_matches_merchant_text_case_insensitively(client, db_sessionmaker):
    await register(client)
    await _seed(client, db_sessionmaker)

    page = (await client.get("/api/expenses/grouped", params={"q": "cOfFeE"})).json()
    assert _merchants(page) == ["Bootleg Coffee Roasters"]


async def test_search_matches_the_description(client):
    await register(client)
    await client.post(
        "/api/expenses",
        json={
            "total": "180.00",
            "currency": "THB",
            "description": "Grilled squid",
            "merchant": "Jodd Fairs",
        },
    )

    page = (await client.get("/api/expenses/grouped", params={"q": "squid"})).json()
    assert [e["description"] for group in page["groups"] for e in group["expenses"]] == [
        "Grilled squid"
    ]


async def test_search_matches_the_resolved_place_name(client, db_sessionmaker):
    await register(client)
    place_id = await _a_place(db_sessionmaker, "Baan Celadon")
    # Merchant text that shares nothing with the place name, so a match can
    # only have come through the join.
    await _spend(client, "890.00", "ceramics shop", place_id, "2026-08-10T11:00:00Z")
    await _spend(client, "62.00", "BTS Ari", spent_at="2026-08-12T09:00:00Z")

    page = (await client.get("/api/expenses/grouped", params={"q": "celadon"})).json()
    assert _merchants(page) == ["ceramics shop"]
    assert page["groups"][0]["place"]["name"] == "Baan Celadon"


async def test_search_narrows_the_totals_not_just_the_visible_rows(client, db_sessionmaker):
    await register(client)
    await _seed(client, db_sessionmaker)

    page = (await client.get("/api/expenses/grouped", params={"q": "b", "page_size": 1})).json()
    # "Bootleg Coffee Roasters" and "BTS Ari", not the ramen
    assert page["total"] == 2
    assert page["total_pages"] == 2


async def test_a_term_with_no_matches_returns_an_empty_page(client, db_sessionmaker):
    await register(client)
    await _seed(client, db_sessionmaker)

    page = (await client.get("/api/expenses/grouped", params={"q": "zzz"})).json()
    assert page["groups"] == []
    assert page["total"] == 0
    assert page["total_pages"] == 1


async def test_wildcard_characters_are_matched_literally(client, db_sessionmaker):
    await register(client)
    await _seed(client, db_sessionmaker)
    await _spend(client, "10.00", "50% off stall", spent_at="2026-08-13T09:00:00Z")

    # A bare % would otherwise match every expense
    page = (await client.get("/api/expenses/grouped", params={"q": "%"})).json()
    assert _merchants(page) == ["50% off stall"]

    # As would _, one character at a time
    page = (await client.get("/api/expenses/grouped", params={"q": "_"})).json()
    assert page["total"] == 0


async def test_search_never_reaches_another_users_expenses(client):
    await register(client, email="a@example.com")
    await _spend(client, "95.00", "Bootleg Coffee Roasters", spent_at="2026-08-11T08:00:00Z")

    await register(client, email="b@example.com")
    page = (await client.get("/api/expenses/grouped", params={"q": "coffee"})).json()
    assert page["groups"] == []
    assert page["total"] == 0


async def test_a_blank_term_is_the_same_as_no_search(client, db_sessionmaker):
    await register(client)
    await _seed(client, db_sessionmaker)

    unsearched = (await client.get("/api/expenses/grouped")).json()
    for blank in ("", "   "):
        page = (await client.get("/api/expenses/grouped", params={"q": blank})).json()
        assert page == unsearched


async def test_the_flat_list_takes_the_same_search(client, db_sessionmaker):
    await register(client)
    await _seed(client, db_sessionmaker)

    expenses = (await client.get("/api/expenses", params={"q": "itto"})).json()
    assert [e["merchant"] for e in expenses] == ["Menya Itto"]
