"""Spending you never photographed still has to be visible.

A manual expense used to reach the timeline only as a number in the day's
total: no photo meant no card, and a day paid for in cash read as an empty
day wearing a total. These cover the entries drawn for it — on the day, in
the stop it fell inside, and on the trip the day belongs to.
"""

from datetime import datetime

import sqlalchemy as sa

from app.models import Visit
from app.services.analysis import run_image_analysis
from tests.conftest import register
from tests.util import make_jpeg

BKK = (13.7563, 100.5018)


async def _manual(client, total: str, when: str, **extra) -> dict:
    response = await client.post(
        "/api/expenses",
        json={"total": total, "currency": "THB", "spent_at": when, **extra},
    )
    assert response.status_code == 201, response.text
    return response.json()


async def _photo(client, db_sessionmaker, when: datetime, color=(200, 60, 60)) -> dict:
    created = (
        await client.post(
            "/api/images",
            files=[
                (
                    "files",
                    ("p.jpg", make_jpeg(*BKK, taken_at=when, color=color), "image/jpeg"),
                )
            ],
        )
    ).json()
    async with db_sessionmaker() as db:
        await run_image_analysis(db, created[0]["id"])
    return created[0]


async def test_photoless_expense_is_an_entry_of_the_day(client):
    await register(client)
    expense = await _manual(
        client, "120", "2026-08-08T14:30:00Z", description="Songthaew ride"
    )

    day = (await client.get("/api/timeline", params={"date": "2026-08-08"})).json()
    assert [e["id"] for e in day["expenses"]] == [expense["id"]]
    assert day["expenses"][0]["description"] == "Songthaew ride"
    assert day["visits"] == []


async def test_the_day_entries_are_in_the_order_they_happened(client):
    await register(client)
    late = await _manual(client, "50", "2026-08-08T18:00:00Z")
    early = await _manual(client, "60", "2026-08-08T07:00:00Z")

    day = (await client.get("/api/timeline", params={"date": "2026-08-08"})).json()
    assert [e["id"] for e in day["expenses"]] == [early["id"], late["id"]]


async def test_an_expense_inside_a_stop_is_shown_on_that_stop(client, db_sessionmaker):
    """It belongs to the stop, so it is a line on its card rather than a card."""
    await register(client)
    await _photo(client, db_sessionmaker, datetime(2026, 8, 8, 12, 30))
    async with db_sessionmaker() as db:
        visit = await db.scalar(sa.select(Visit))
        assert visit is not None

    tip = await _manual(client, "40", "2026-08-08T12:30:00Z", description="Tip")

    day = (await client.get("/api/timeline", params={"date": "2026-08-08"})).json()
    assert day["expenses"] == []
    assert [e["id"] for e in day["visits"][0]["expenses"]] == [tip["id"]]
    assert day["visits"][0]["spend"]["base_total_minor"] == 4000


async def test_a_receipt_backed_expense_is_left_to_its_photo(client, db_sessionmaker):
    """The photo already stands for it; a text row as well would say it twice."""
    await register(client)
    photo = await _photo(client, db_sessionmaker, datetime(2026, 8, 8, 12, 30))
    created = (
        await client.post(
            "/api/expenses",
            json={
                "total": "425",
                "currency": "THB",
                "image_id": photo["id"],
                "spent_at": "2026-08-08T12:30:00Z",
            },
        )
    ).json()
    assert created["source"] == "receipt"

    day = (await client.get("/api/timeline", params={"date": "2026-08-08"})).json()
    assert day["expenses"] == []
    assert day["visits"][0]["expenses"] == []
    assert day["visits"][0]["spend"]["base_total_minor"] == 42500


async def test_a_week_counts_the_expenses_of_a_day_with_nothing_else_on_it(client):
    await register(client)
    await _manual(client, "62", "2026-08-08T08:05:00Z")
    await _manual(client, "120", "2026-08-08T14:30:00Z")

    week = (
        await client.get(
            "/api/timeline/range", params={"date": "2026-08-08", "span": "week"}
        )
    ).json()
    day = next(d for d in week["days"] if d["date"] == "2026-08-08")
    assert day["expense_count"] == 2
    assert day["visit_count"] == 0
    assert day["image_count"] == 0
    other = next(d for d in week["days"] if d["date"] == "2026-08-07")
    assert other["expense_count"] == 0


async def test_a_trip_day_with_only_spending_still_gets_a_day(client, db_sessionmaker):
    """Days are not made by photographs alone: cash makes one too."""
    await register(client)
    await _photo(client, db_sessionmaker, datetime(2026, 8, 8, 12, 30))
    start = await _manual(client, "300", "2026-08-08T08:00:00Z", description="Airport taxi")
    dinner = await _manual(client, "340", "2026-08-09T19:10:00Z", description="Khao soi")
    end = await _manual(client, "200", "2026-08-10T09:00:00Z", description="Taxi home")

    trip = (
        await client.post(
            "/api/trips",
            json={
                "title": "Up north",
                "start_expense_id": start["id"],
                "end_expense_id": end["id"],
            },
        )
    ).json()

    days = {day["date"]: day for day in trip["days"]}
    assert set(days) == {"2026-08-08", "2026-08-09", "2026-08-10"}
    # The middle day has no photo at all and exists because of the dinner alone
    assert days["2026-08-09"]["visits"] == []
    assert [e["id"] for e in days["2026-08-09"]["expenses"]] == [dinner["id"]]
    assert days["2026-08-09"]["spend"]["base_total_minor"] == 34000
    # The photographed day carries its stop and the loose taxi beside it
    assert len(days["2026-08-08"]["visits"]) == 1
    assert [e["id"] for e in days["2026-08-08"]["expenses"]] == [start["id"]]
    assert days["2026-08-08"]["spend"]["base_total_minor"] == 30000
