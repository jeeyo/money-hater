"""Week and month views: the same timeline, summarised a day at a time."""

from datetime import datetime

from tests.conftest import register
from tests.util import make_jpeg


async def _expense(client, total: str, when: str, description: str = "") -> dict:
    response = await client.post(
        "/api/expenses",
        json={"total": total, "currency": "THB", "description": description, "spent_at": when},
    )
    assert response.status_code == 201, response.text
    return response.json()


async def _photo(client, db_sessionmaker, lat: float, lng: float, taken_at: datetime) -> dict:
    created = (
        await client.post(
            "/api/images",
            files=[("files", ("a.jpg", make_jpeg(lat, lng, taken_at=taken_at), "image/jpeg"))],
        )
    ).json()
    from app.services.analysis import run_image_analysis

    async with db_sessionmaker() as db:
        await run_image_analysis(db, created[0]["id"])
    return created[0]


async def _range(client, date: str, span: str) -> dict:
    response = await client.get("/api/timeline/range", params={"date": date, "span": span})
    assert response.status_code == 200, response.text
    return response.json()


async def test_a_week_covers_monday_to_sunday_whichever_day_you_ask_from(client):
    await register(client)

    # 2026-08-05 is a Wednesday
    week = await _range(client, "2026-08-05", "week")
    assert (week["start"], week["end"]) == ("2026-08-03", "2026-08-09")
    assert [day["date"] for day in week["days"]][0] == "2026-08-03"
    assert len(week["days"]) == 7

    # Asking from the Sunday at the end lands on the same week, not the next one
    assert await _range(client, "2026-08-09", "week") == week


async def test_a_month_runs_the_whole_calendar_month(client):
    await register(client)

    february = await _range(client, "2026-02-17", "month")
    assert (february["start"], february["end"]) == ("2026-02-01", "2026-02-28")
    assert len(february["days"]) == 28

    assert len((await _range(client, "2026-08-17", "month"))["days"]) == 31


async def test_empty_days_are_kept_so_a_calendar_can_be_laid_out(client):
    await register(client)
    await _expense(client, "425.50", "2026-08-05T12:30:00Z", "Lunch")

    week = await _range(client, "2026-08-05", "week")
    spent = {day["date"]: day["spend"]["base_total_minor"] for day in week["days"]}

    assert spent["2026-08-05"] == 42550
    assert list(spent.values()).count(0) == 6
    assert week["spend"]["base_total_minor"] == 42550


async def test_a_day_summarises_its_stops_and_photos(client, db_sessionmaker):
    await register(client)
    await _photo(client, db_sessionmaker, 13.7465, 100.4930, datetime(2026, 8, 5, 15, 5))
    await _photo(client, db_sessionmaker, 13.7465, 100.4931, datetime(2026, 8, 5, 15, 20))

    week = await _range(client, "2026-08-05", "week")
    day = next(d for d in week["days"] if d["date"] == "2026-08-05")

    assert day["visit_count"] == 1
    assert len(day["stops"]) == 1
    assert day["image_count"] == 2
    # Enough frames to recognise the day by, and no more than it has
    assert len(day["thumbs"]) == 2


async def test_photos_no_stop_claimed_still_count_towards_their_day(client, db_sessionmaker):
    """A photo with no location is placed by time, not by a visit — it still shows."""
    await register(client)
    await _photo(client, db_sessionmaker, 13.7465, 100.4930, datetime(2026, 8, 5, 15, 5))

    created = (
        await client.post(
            "/api/images",
            files=[
                (
                    "files",
                    ("b.jpg", make_jpeg(taken_at=datetime(2026, 8, 6, 9, 0)), "image/jpeg"),
                )
            ],
        )
    ).json()
    assert created[0]["lat"] is None

    week = await _range(client, "2026-08-05", "week")
    sixth = next(d for d in week["days"] if d["date"] == "2026-08-06")
    assert sixth["image_count"] == 1


async def test_days_report_the_trip_they_belong_to(client):
    await register(client)
    start = await _expense(client, "600", "2026-08-04T09:00:00Z", "Flight out")
    end = await _expense(client, "700", "2026-08-06T19:00:00Z", "Flight home")
    trip = (
        await client.post(
            "/api/trips",
            json={
                "title": "Chiang Mai weekend",
                "start_expense_id": start["id"],
                "end_expense_id": end["id"],
            },
        )
    ).json()

    week = await _range(client, "2026-08-05", "week")
    in_trip = [day["date"] for day in week["days"] if day["trip"]]

    assert in_trip == ["2026-08-04", "2026-08-05", "2026-08-06"]
    assert [t["id"] for t in week["trips"]] == [trip["id"]]

    # The eve of a trip is not part of it — the day view has to agree
    eve = await client.get("/api/timeline", params={"date": "2026-08-03"})
    assert eve.json()["trip"] is None


async def test_the_span_must_be_a_week_or_a_month(client):
    await register(client)
    assert (
        await client.get("/api/timeline/range", params={"date": "2026-08-05", "span": "year"})
    ).status_code == 422
    assert (
        await client.get("/api/timeline/range", params={"date": "05-08-2026", "span": "week"})
    ).status_code == 422
