"""Open-ended trips: named when you set off, still running until you end them.

The window of an open trip has no fixed end, so these tests are written against
*today* rather than the fixed calendar dates used elsewhere. Where the assertion
is about the window moving, `now` is pinned instead of slept through.
"""

from datetime import UTC, datetime, time, timedelta

import pytest
import sqlalchemy as sa
from sqlalchemy.exc import IntegrityError

from app.models import Trip, User
from app.services import trips as trip_service
from tests.conftest import register


def _at(days_ago: int, hour: int = 0) -> str:
    """Midnight-anchored moment on a past day — never in the future."""
    day = (datetime.now(UTC) - timedelta(days=days_ago)).date()
    return datetime.combine(day, time(hour=hour), tzinfo=UTC).isoformat()


def _today() -> str:
    return datetime.now(UTC).date().isoformat()


async def _expense(client, total: str, when: str, description: str = "") -> dict:
    response = await client.post(
        "/api/expenses",
        json={"total": total, "currency": "THB", "description": description, "spent_at": when},
    )
    assert response.status_code == 201, response.text
    return response.json()


async def _open_trip(client, start: dict, title: str = "Chiang Mai, still going") -> dict:
    response = await client.post(
        "/api/trips", json={"title": title, "start_expense_id": start["id"]}
    )
    assert response.status_code == 201, response.text
    return response.json()


async def _current_user(db) -> User:
    return await db.scalar(sa.select(User))


async def test_an_open_trip_runs_to_today(client):
    await register(client)
    start = await _expense(client, "600", _at(2, hour=9), "Flight out")
    trip = await _open_trip(client, start)

    assert trip["end_expense_id"] is None
    assert trip["ended_at"][:10] == _today()
    assert trip["day_count"] == 3


async def test_todays_spending_joins_the_open_trip(client):
    """The point of an open trip: things land in it as they happen."""
    await register(client)
    start = await _expense(client, "600", _at(1, hour=9), "Flight out")
    trip = await _open_trip(client, start)
    assert trip["spend"]["base_total_minor"] == 60000

    await _expense(client, "150", _at(0, hour=1), "Coffee today")
    refreshed = (await client.get(f"/api/trips/{trip['id']}")).json()
    assert [e["description"] for e in refreshed["expenses"]] == ["Flight out", "Coffee today"]
    assert refreshed["spend"]["base_total_minor"] == 60000 + 15000


async def test_the_window_keeps_growing_on_its_own(client, db_sessionmaker):
    """Nothing updates the row — the window is derived from the clock."""
    await register(client)
    start = await _expense(client, "600", _at(1, hour=9))
    trip = await _open_trip(client, start)

    async with db_sessionmaker() as db:
        loaded = await trip_service.load_trip(db, await _current_user(db), trip["id"])
        in_five_days = trip_service.window_of(
            loaded, 0, now=datetime.now(UTC) + timedelta(days=5)
        )
        assert len(trip_service.day_range(in_five_days)) == 7


async def test_only_one_trip_may_be_open_at_a_time(client):
    await register(client)
    first = await _expense(client, "600", _at(4, hour=9))
    await _open_trip(client, first, title="Chiang Mai")

    # Even a start on a day the first trip does not cover is refused
    second = await _expense(client, "600", _at(2, hour=9))
    response = await client.post(
        "/api/trips", json={"title": "Second", "start_expense_id": second["id"]}
    )
    assert response.status_code == 422
    assert "Chiang Mai" in response.json()["detail"]


async def test_the_database_itself_refuses_a_second_open_trip(client, db_sessionmaker):
    """The rule is an index, so a concurrent create cannot slip past the check."""
    await register(client)
    start = await _expense(client, "600", _at(2, hour=9))
    await _open_trip(client, start)

    async with db_sessionmaker() as db:
        user = await _current_user(db)
        db.add(Trip(user_id=user.id, title="Sneaky", start_expense_id=start["id"]))
        with pytest.raises(IntegrityError):
            await db.commit()


async def test_an_open_trip_blocks_an_overlapping_trip(client):
    """It occupies every day up to today, so nothing else can claim those days."""
    await register(client)
    start = await _expense(client, "600", _at(3, hour=9))
    await _open_trip(client, start, title="Chiang Mai")

    a = await _expense(client, "100", _at(2, hour=9))
    b = await _expense(client, "100", _at(1, hour=9))
    response = await client.post(
        "/api/trips",
        json={"title": "Retroactive", "start_expense_id": a["id"], "end_expense_id": b["id"]},
    )
    assert response.status_code == 422
    assert "Chiang Mai" in response.json()["detail"]


async def test_end_trip_now_picks_the_latest_expense(client):
    await register(client)
    start = await _expense(client, "600", _at(2, hour=9), "Flight out")
    trip = await _open_trip(client, start)
    await _expense(client, "150", _at(1, hour=10), "Dinner")
    last = await _expense(client, "890", _at(0, hour=2), "Taxi home")

    ended = (await client.post(f"/api/trips/{trip['id']}/end")).json()
    assert ended["end_expense_id"] == last["id"]
    assert ended["day_count"] == 3

    # Frozen: the window no longer follows the clock. (Today is still included
    # in full — the window covers whole days — but tomorrow never joins.)
    tomorrow = (datetime.now(UTC) + timedelta(days=1)).replace(hour=9)
    await _expense(client, "70", tomorrow.isoformat(), "Groceries")
    refreshed = (await client.get(f"/api/trips/{trip['id']}")).json()
    assert refreshed["day_count"] == 3
    assert "Groceries" not in [e["description"] for e in refreshed["expenses"]]


async def test_ending_at_a_chosen_expense(client):
    """It actually ended yesterday — you just got round to saying so."""
    await register(client)
    start = await _expense(client, "600", _at(2, hour=9), "Flight out")
    trip = await _open_trip(client, start)
    home = await _expense(client, "890", _at(1, hour=20), "Taxi home")
    await _expense(client, "70", _at(0, hour=2), "Groceries")

    ended = (
        await client.post(f"/api/trips/{trip['id']}/end", json={"end_expense_id": home["id"]})
    ).json()
    assert ended["end_expense_id"] == home["id"]
    assert ended["day_count"] == 2
    assert "Groceries" not in [e["description"] for e in ended["expenses"]]


async def test_a_trip_opened_today_can_be_ended_today(client):
    """The starting expense is always inside the window, so "end now" resolves."""
    await register(client)
    start = await _expense(client, "600", _at(0, hour=0), "Lunch out")
    trip = await _open_trip(client, start)

    ended = (await client.post(f"/api/trips/{trip['id']}/end")).json()
    assert ended["end_expense_id"] == start["id"]
    assert ended["day_count"] == 1


async def test_ending_before_the_start_is_rejected(client):
    await register(client)
    earlier = await _expense(client, "100", _at(5, hour=9))
    start = await _expense(client, "600", _at(2, hour=9))
    trip = await _open_trip(client, start)

    response = await client.post(
        f"/api/trips/{trip['id']}/end", json={"end_expense_id": earlier["id"]}
    )
    assert response.status_code == 422
    assert "before" in response.json()["detail"]


async def test_a_trip_that_already_ended_cannot_be_ended_again(client):
    await register(client)
    start = await _expense(client, "600", _at(2, hour=9))
    end = await _expense(client, "890", _at(1, hour=9))
    trip = (
        await client.post(
            "/api/trips",
            json={
                "title": "Done",
                "start_expense_id": start["id"],
                "end_expense_id": end["id"],
            },
        )
    ).json()

    response = await client.post(f"/api/trips/{trip['id']}/end")
    assert response.status_code == 422
    assert "already ended" in response.json()["detail"]


async def test_a_trip_can_be_reopened(client):
    """Ended it by mistake, or it turned out not to be over."""
    await register(client)
    start = await _expense(client, "600", _at(2, hour=9))
    trip = await _open_trip(client, start)
    await client.post(f"/api/trips/{trip['id']}/end")

    reopened = (
        await client.patch(f"/api/trips/{trip['id']}", json={"end_expense_id": None})
    ).json()
    assert reopened["end_expense_id"] is None
    assert reopened["ended_at"][:10] == _today()


async def test_reopening_is_refused_while_another_trip_is_open(client):
    await register(client)
    old_start = await _expense(client, "600", _at(6, hour=9))
    old_end = await _expense(client, "600", _at(5, hour=9))
    old = (
        await client.post(
            "/api/trips",
            json={
                "title": "Last week",
                "start_expense_id": old_start["id"],
                "end_expense_id": old_end["id"],
            },
        )
    ).json()

    current_start = await _expense(client, "600", _at(2, hour=9))
    await _open_trip(client, current_start, title="This week")

    response = await client.patch(f"/api/trips/{old['id']}", json={"end_expense_id": None})
    assert response.status_code == 422
    assert "This week" in response.json()["detail"]


async def test_renaming_an_open_trip_leaves_it_open(client):
    """A PATCH without the field must not be read as "end it"."""
    await register(client)
    start = await _expense(client, "600", _at(2, hour=9))
    trip = await _open_trip(client, start)

    renamed = (
        await client.patch(f"/api/trips/{trip['id']}", json={"title": "Chiang Mai"})
    ).json()
    assert renamed["title"] == "Chiang Mai"
    assert renamed["end_expense_id"] is None


async def test_an_open_trip_cannot_start_in_the_future(client):
    await register(client)
    ahead = (datetime.now(UTC) + timedelta(days=2)).isoformat()
    start = await _expense(client, "600", ahead)

    response = await client.post(
        "/api/trips", json={"title": "Next week", "start_expense_id": start["id"]}
    )
    assert response.status_code == 422
    assert "future" in response.json()["detail"]


async def test_the_timeline_says_todays_trip_is_still_going(client):
    await register(client)
    start = await _expense(client, "600", _at(1, hour=9))
    trip = await _open_trip(client, start)

    today = (await client.get("/api/timeline", params={"date": _today()})).json()
    assert today["trip"] == {
        "id": trip["id"],
        "title": "Chiang Mai, still going",
        "end_expense_id": None,
    }
