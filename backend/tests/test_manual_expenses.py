"""Expenses logged by hand, with no receipt photo."""

from datetime import datetime

import sqlalchemy as sa

from app.models import Expense, Visit
from app.services.analysis import run_image_analysis
from tests.conftest import register
from tests.util import make_jpeg

BKK = (13.7563, 100.5018)


async def test_create_expense_without_receipt(client):
    await register(client)
    response = await client.post(
        "/api/expenses",
        json={
            "total": "60.00",
            "currency": "THB",
            "merchant": "Grab to office",
            "spent_at": "2026-08-08T08:05:00Z",
            "note": "cash",
        },
    )
    assert response.status_code == 201, response.text
    expense = response.json()
    assert expense["image_id"] is None
    assert expense["source"] == "manual"
    assert expense["total_minor"] == 6000
    assert expense["base_total_minor"] == 6000
    assert expense["needs_review"] is False
    assert expense["merchant"] == "Grab to office"

    listed = (await client.get("/api/expenses")).json()
    assert len(listed) == 1
    assert listed[0]["id"] == expense["id"]


async def test_manual_expense_with_line_items(client):
    await register(client)
    expense = (
        await client.post(
            "/api/expenses",
            json={
                "total": "250",
                "currency": "THB",
                "merchant": "Street food",
                "items": [
                    {"name": "Pad thai", "qty": 2, "amount": "180"},
                    {"name": "Coconut", "qty": 1, "amount": "70"},
                ],
            },
        )
    ).json()
    assert len(expense["items"]) == 2
    assert expense["items"][0]["name"] == "Pad thai"
    assert expense["items"][0]["amount_minor"] == 18000


async def test_manual_expense_defaults_spent_at_to_now(client):
    await register(client)
    expense = (
        await client.post("/api/expenses", json={"total": "20", "currency": "THB"})
    ).json()
    assert expense["spent_at"] is not None


async def test_manual_expense_attaches_to_the_visit_it_falls_inside(
    client, db_sessionmaker
):
    await register(client)
    created = (
        await client.post(
            "/api/images",
            files=[
                (
                    "files",
                    (
                        "lunch.jpg",
                        make_jpeg(*BKK, taken_at=datetime(2026, 8, 8, 12, 30)),
                        "image/jpeg",
                    ),
                )
            ],
        )
    ).json()
    async with db_sessionmaker() as db:
        await run_image_analysis(db, created[0]["id"])
        visit = await db.scalar(sa.select(Visit))
        assert visit is not None

    # A cash tip during that same stop lands on the same visit
    expense = (
        await client.post(
            "/api/expenses",
            json={
                "total": "40",
                "currency": "THB",
                "merchant": "Tip",
                "spent_at": "2026-08-08T12:30:00Z",
            },
        )
    ).json()
    assert expense["visit_id"] == visit.id

    # ...and shows up in that day's timeline spend
    day = (
        await client.get(
            "/api/timeline", params={"date": "2026-08-08", "tz_offset_minutes": 0}
        )
    ).json()
    assert day["spend"]["base_total_minor"] == 4000
    assert day["trips"][0]["visits"][0]["spend"]["base_total_minor"] == 4000


async def test_manual_expense_survives_reclustering(client, db_sessionmaker):
    """Re-clustering rebuilds visits; a hand-entered expense must not lose its stop."""
    await register(client)
    first = (
        await client.post(
            "/api/images",
            files=[
                (
                    "files",
                    ("a.jpg", make_jpeg(*BKK, taken_at=datetime(2026, 8, 8, 12, 30)), "image/jpeg"),
                )
            ],
        )
    ).json()
    async with db_sessionmaker() as db:
        await run_image_analysis(db, first[0]["id"])

    expense = (
        await client.post(
            "/api/expenses",
            json={"total": "40", "currency": "THB", "spent_at": "2026-08-08T12:30:00Z"},
        )
    ).json()
    assert expense["visit_id"] is not None

    # A later upload triggers a full recluster
    second = (
        await client.post(
            "/api/images",
            files=[
                (
                    "files",
                    (
                        "b.jpg",
                        make_jpeg(*BKK, taken_at=datetime(2026, 8, 8, 12, 40), color=(2, 3, 4)),
                        "image/jpeg",
                    ),
                )
            ],
        )
    ).json()
    async with db_sessionmaker() as db:
        await run_image_analysis(db, second[0]["id"])

    refreshed = (await client.get("/api/expenses")).json()[0]
    assert refreshed["visit_id"] is not None
    day = (
        await client.get(
            "/api/timeline", params={"date": "2026-08-08", "tz_offset_minutes": 0}
        )
    ).json()
    assert day["trips"][0]["visits"][0]["spend"]["base_total_minor"] == 4000


async def test_expense_outside_any_visit_stays_unattached(client):
    await register(client)
    expense = (
        await client.post(
            "/api/expenses",
            json={"total": "99", "currency": "THB", "spent_at": "2026-01-01T00:00:00Z"},
        )
    ).json()
    assert expense["visit_id"] is None


async def test_delete_expense(client):
    await register(client)
    expense = (
        await client.post("/api/expenses", json={"total": "10", "currency": "THB"})
    ).json()
    assert (await client.delete(f"/api/expenses/{expense['id']}")).status_code == 204
    assert (await client.get("/api/expenses")).json() == []


async def test_expenses_are_user_scoped(client, db_sessionmaker):
    await register(client, email="alice@example.com")
    expense = (
        await client.post("/api/expenses", json={"total": "10", "currency": "THB"})
    ).json()

    await client.post("/api/auth/logout")
    await register(client, email="bob@example.com")
    assert (await client.get("/api/expenses")).json() == []
    assert (await client.delete(f"/api/expenses/{expense['id']}")).status_code == 404
    assert (
        await client.post(f"/api/expenses/{expense['id']}/confirm", json={})
    ).status_code == 404

    async with db_sessionmaker() as db:
        assert await db.scalar(sa.select(sa.func.count()).select_from(Expense)) == 1


async def test_rejects_nonpositive_total(client):
    await register(client)
    assert (
        await client.post("/api/expenses", json={"total": "0", "currency": "THB"})
    ).status_code == 422
    assert (
        await client.post("/api/expenses", json={"total": "-5", "currency": "THB"})
    ).status_code == 422


async def test_deleting_receipt_image_removes_its_expense(client, db_sessionmaker, monkeypatch):
    """Manual expenses survive on their own; receipt-backed ones follow the photo."""
    import app.services.analysis as analysis_mod
    from tests.test_receipts import RECEIPT_RESULT

    await register(client)
    created = (
        await client.post(
            "/api/images",
            files=[("files", ("r.jpg", make_jpeg(color=(9, 9, 9)), "image/jpeg"))],
        )
    ).json()

    async def fake_vision(path, mime):
        return RECEIPT_RESULT

    monkeypatch.setattr(analysis_mod, "analyze_image_content", fake_vision)
    async with db_sessionmaker() as db:
        await run_image_analysis(db, created[0]["id"])

    manual = (
        await client.post("/api/expenses", json={"total": "10", "currency": "THB"})
    ).json()
    assert len((await client.get("/api/expenses")).json()) == 2

    assert (await client.delete(f"/api/images/{created[0]['id']}")).status_code == 204
    remaining = (await client.get("/api/expenses")).json()
    assert [e["id"] for e in remaining] == [manual["id"]]
