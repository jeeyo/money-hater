"""Trips: an optional grouping the user makes by picking two expenses."""

from datetime import datetime

from tests.conftest import register
from tests.util import make_jpeg


async def _expense(client, total: str, when: str, description: str = "") -> dict:
    response = await client.post(
        "/api/expenses",
        json={
            "total": total,
            "currency": "THB",
            "description": description,
            "spent_at": when,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


async def _trip(client, start: dict, end: dict, title: str = "Chiang Mai weekend") -> dict:
    response = await client.post(
        "/api/trips",
        json={"title": title, "start_expense_id": start["id"], "end_expense_id": end["id"]},
    )
    assert response.status_code == 201, response.text
    return response.json()


async def test_no_trips_exist_until_the_user_makes_one(client, db_sessionmaker):
    """Days are automatic; grouping them into a trip never is."""
    await register(client)
    created = (
        await client.post(
            "/api/images",
            files=[
                (
                    "files",
                    (
                        "a.jpg",
                        make_jpeg(13.75, 100.5, taken_at=datetime(2026, 8, 8, 12, 0)),
                        "image/jpeg",
                    ),
                )
            ],
        )
    ).json()
    from app.services.analysis import run_image_analysis

    async with db_sessionmaker() as db:
        await run_image_analysis(db, created[0]["id"])

    assert (await client.get("/api/trips")).json() == []
    day = (
        await client.get("/api/timeline", params={"date": "2026-08-08"})
    ).json()
    assert day["trip"] is None
    assert len(day["visits"]) == 1


async def test_create_trip_from_two_expenses(client):
    await register(client)
    start = await _expense(client, "600", "2026-08-01T09:00:00Z", "Flight out")
    await _expense(client, "150", "2026-08-01T14:40:00Z", "Coffee")
    end = await _expense(client, "890", "2026-08-02T11:25:00Z", "Souvenir")

    trip = await _trip(client, start, end)
    assert trip["title"] == "Chiang Mai weekend"
    assert trip["start_expense_id"] == start["id"]
    assert trip["end_expense_id"] == end["id"]
    assert trip["day_count"] == 2
    # Everything in the window counts, including the expenses between the bounds
    assert trip["spend"]["base_total_minor"] == 60000 + 15000 + 89000
    assert [e["description"] for e in trip["expenses"]] == ["Flight out", "Coffee", "Souvenir"]


async def test_expenses_outside_the_window_are_excluded(client):
    await register(client)
    await _expense(client, "50", "2026-07-31T20:00:00Z", "Before")
    start = await _expense(client, "600", "2026-08-01T09:00:00Z", "Flight out")
    end = await _expense(client, "890", "2026-08-02T11:25:00Z", "Souvenir")
    await _expense(client, "70", "2026-08-03T08:00:00Z", "After")

    trip = await _trip(client, start, end)
    assert [e["description"] for e in trip["expenses"]] == ["Flight out", "Souvenir"]
    assert trip["spend"]["base_total_minor"] == 60000 + 89000


async def test_trip_groups_its_days_with_their_stops(client, db_sessionmaker):
    from app.services.analysis import run_image_analysis

    await register(client)
    for name, when in [
        ("d1.jpg", datetime(2026, 8, 1, 10, 15)),
        ("d2.jpg", datetime(2026, 8, 2, 11, 0)),
    ]:
        created = (
            await client.post(
                "/api/images",
                files=[("files", (name, make_jpeg(18.79, 98.98, taken_at=when), "image/jpeg"))],
            )
        ).json()
        async with db_sessionmaker() as db:
            await run_image_analysis(db, created[0]["id"])

    start = await _expense(client, "600", "2026-08-01T09:00:00Z")
    end = await _expense(client, "890", "2026-08-02T11:25:00Z")
    trip = await _trip(client, start, end)

    assert [day["date"] for day in trip["days"]] == ["2026-08-01", "2026-08-02"]
    assert trip["visit_count"] == 2
    assert trip["image_count"] == 2
    assert len(trip["days"][0]["visits"]) == 1


async def test_timeline_shows_which_trip_a_day_belongs_to(client):
    await register(client)
    start = await _expense(client, "600", "2026-08-01T09:00:00Z")
    end = await _expense(client, "890", "2026-08-02T11:25:00Z")
    trip = await _trip(client, start, end)

    inside = (await client.get("/api/timeline", params={"date": "2026-08-02"})).json()
    assert inside["trip"] == {
        "id": trip["id"],
        "title": "Chiang Mai weekend",
        "end_expense_id": end["id"],
    }

    outside = (await client.get("/api/timeline", params={"date": "2026-08-05"})).json()
    assert outside["trip"] is None


async def test_end_before_start_is_rejected(client):
    await register(client)
    first = await _expense(client, "100", "2026-08-01T09:00:00Z")
    second = await _expense(client, "100", "2026-08-02T09:00:00Z")
    response = await client.post(
        "/api/trips",
        json={
            "title": "Backwards",
            "start_expense_id": second["id"],
            "end_expense_id": first["id"],
        },
    )
    assert response.status_code == 422
    assert "before" in response.json()["detail"]


async def test_overlapping_trips_are_rejected(client):
    """A day belongs to at most one trip, so the windows may not overlap."""
    await register(client)
    a = await _expense(client, "100", "2026-08-01T09:00:00Z")
    b = await _expense(client, "100", "2026-08-03T09:00:00Z")
    c = await _expense(client, "100", "2026-08-02T09:00:00Z")
    d = await _expense(client, "100", "2026-08-05T09:00:00Z")

    await _trip(client, a, b, title="First")
    response = await client.post(
        "/api/trips",
        json={"title": "Overlapping", "start_expense_id": c["id"], "end_expense_id": d["id"]},
    )
    assert response.status_code == 422
    assert "First" in response.json()["detail"]


async def test_single_expense_trip_is_allowed(client):
    """Start and end can be the same expense — a one-off day out."""
    await register(client)
    only = await _expense(client, "100", "2026-08-01T09:00:00Z")
    trip = await _trip(client, only, only, title="Day out")
    assert trip["day_count"] == 1
    assert trip["spend"]["base_total_minor"] == 10000


async def test_rename_and_rebound(client):
    await register(client)
    start = await _expense(client, "100", "2026-08-01T09:00:00Z")
    middle = await _expense(client, "100", "2026-08-02T09:00:00Z")
    end = await _expense(client, "100", "2026-08-03T09:00:00Z")
    trip = await _trip(client, start, end)

    renamed = (
        await client.patch(f"/api/trips/{trip['id']}", json={"title": "Chiang Mai"})
    ).json()
    assert renamed["title"] == "Chiang Mai"

    # Pull the end in: the last expense drops out of the trip
    shortened = (
        await client.patch(
            f"/api/trips/{trip['id']}", json={"end_expense_id": middle["id"]}
        )
    ).json()
    assert shortened["day_count"] == 2
    assert shortened["spend"]["base_total_minor"] == 20000


async def test_deleting_a_trip_keeps_everything_inside_it(client):
    await register(client)
    start = await _expense(client, "100", "2026-08-01T09:00:00Z")
    end = await _expense(client, "100", "2026-08-02T09:00:00Z")
    trip = await _trip(client, start, end)

    assert (await client.delete(f"/api/trips/{trip['id']}")).status_code == 204
    assert (await client.get("/api/trips")).json() == []
    # Ungrouping is not deleting
    assert len((await client.get("/api/expenses")).json()) == 2


async def test_cannot_delete_an_expense_that_bounds_a_trip(client):
    await register(client)
    start = await _expense(client, "100", "2026-08-01T09:00:00Z")
    end = await _expense(client, "100", "2026-08-02T09:00:00Z")
    middle = await _expense(client, "100", "2026-08-01T18:00:00Z")
    await _trip(client, start, end)

    response = await client.delete(f"/api/expenses/{start['id']}")
    assert response.status_code == 409
    assert "Chiang Mai weekend" in response.json()["detail"]

    # An expense merely inside the window is still free to delete
    assert (await client.delete(f"/api/expenses/{middle['id']}")).status_code == 204


async def test_trips_are_user_scoped(client):
    await register(client, email="alice@example.com")
    start = await _expense(client, "100", "2026-08-01T09:00:00Z")
    end = await _expense(client, "100", "2026-08-02T09:00:00Z")
    trip = await _trip(client, start, end)

    await client.post("/api/auth/logout")
    await register(client, email="bob@example.com")
    assert (await client.get("/api/trips")).json() == []
    assert (await client.get(f"/api/trips/{trip['id']}")).status_code == 404
    assert (await client.delete(f"/api/trips/{trip['id']}")).status_code == 404

    # ...and Bob cannot bound a trip with Alice's expenses
    response = await client.post(
        "/api/trips",
        json={"title": "Nope", "start_expense_id": start["id"], "end_expense_id": end["id"]},
    )
    assert response.status_code == 422


async def test_window_follows_an_edited_bounding_expense(client):
    """Membership is derived, so correcting the start time moves the window."""
    await register(client)
    start = await _expense(client, "100", "2026-08-02T09:00:00Z")
    end = await _expense(client, "100", "2026-08-03T09:00:00Z")
    earlier = await _expense(client, "100", "2026-08-01T09:00:00Z")
    trip = await _trip(client, start, end)
    assert trip["day_count"] == 2
    assert earlier["id"] not in [e["id"] for e in trip["expenses"]]

    await client.patch(
        f"/api/expenses/{start['id']}", json={"spent_at": "2026-08-01T08:00:00Z"}
    )
    refreshed = (await client.get(f"/api/trips/{trip['id']}")).json()
    assert refreshed["day_count"] == 3
    assert earlier["id"] in [e["id"] for e in refreshed["expenses"]]


async def test_window_covers_whole_days_not_just_the_two_moments(client, db_sessionmaker):
    """A photo taken minutes before its own receipt still belongs to the trip."""
    from app.services.analysis import run_image_analysis

    await register(client)
    created = (
        await client.post(
            "/api/images",
            files=[
                (
                    "files",
                    (
                        "cafe.jpg",
                        make_jpeg(18.79, 98.98, taken_at=datetime(2026, 8, 1, 14, 40)),
                        "image/jpeg",
                    ),
                )
            ],
        )
    ).json()
    async with db_sessionmaker() as db:
        await run_image_analysis(db, created[0]["id"])

    # The receipt is stamped two minutes after the photo
    start = await _expense(client, "150", "2026-08-01T14:42:00Z", "Coffee")
    end = await _expense(client, "890", "2026-08-02T11:25:00Z", "Souvenir")
    trip = await _trip(client, start, end)

    assert trip["visit_count"] == 1
    assert trip["days"][0]["date"] == "2026-08-01"


async def test_two_trips_may_not_share_a_day(client):
    await register(client)
    a = await _expense(client, "100", "2026-08-01T09:00:00Z")
    b = await _expense(client, "100", "2026-08-02T09:00:00Z")
    # Same day as `b`, but later — still the same calendar day
    c = await _expense(client, "100", "2026-08-02T20:00:00Z")
    d = await _expense(client, "100", "2026-08-04T09:00:00Z")

    await _trip(client, a, b, title="First")
    response = await client.post(
        "/api/trips",
        json={"title": "Second", "start_expense_id": c["id"], "end_expense_id": d["id"]},
    )
    assert response.status_code == 422
    assert "First" in response.json()["detail"]
