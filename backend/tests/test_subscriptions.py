"""Subscriptions: recurring charges that create a real expense on each due date."""

from datetime import date

import sqlalchemy as sa

from app.models import Subscription
from app.services.subscriptions import advance, next_occurrence, run_due
from tests.conftest import register


def test_next_occurrence_monthly_same_day():
    assert next_occurrence("monthly", 15, None, on_or_after=date(2026, 3, 15)) == date(2026, 3, 15)


def test_next_occurrence_monthly_rolls_to_next_month():
    assert next_occurrence("monthly", 5, None, on_or_after=date(2026, 3, 15)) == date(2026, 4, 5)


def test_next_occurrence_monthly_clamps_short_month():
    assert next_occurrence("monthly", 31, None, on_or_after=date(2026, 2, 1)) == date(2026, 2, 28)


def test_next_occurrence_yearly():
    assert next_occurrence("yearly", 25, 12, on_or_after=date(2026, 1, 1)) == date(2026, 12, 25)
    assert next_occurrence("yearly", 25, 12, on_or_after=date(2026, 12, 26)) == date(2027, 12, 25)


def test_advance_monthly_from_the_fired_date_not_today():
    """Advancing from the occurrence itself avoids drift when a job runs late."""
    assert advance(date(2026, 1, 31), "monthly", 31, None) == date(2026, 2, 28)
    assert advance(date(2026, 2, 28), "monthly", 31, None) == date(2026, 3, 31)


def test_advance_yearly():
    assert advance(date(2028, 2, 29), "yearly", 29, 2) == date(2029, 2, 28)


async def test_create_subscription(client):
    await register(client)
    response = await client.post(
        "/api/subscriptions",
        json={
            "amount": "15.99",
            "currency": "USD",
            "description": "Streaming",
            "merchant": "Netflix",
            "interval": "monthly",
            "day_of_month": 5,
            "start_date": "2026-09-05",
        },
    )
    assert response.status_code == 201, response.text
    sub = response.json()
    assert sub["amount_minor"] == 1599
    assert sub["interval"] == "monthly"
    assert sub["next_run_on"] == "2026-09-05"

    listed = (await client.get("/api/subscriptions")).json()
    assert len(listed) == 1
    assert listed[0]["id"] == sub["id"]


async def test_yearly_subscription_requires_month(client):
    await register(client)
    response = await client.post(
        "/api/subscriptions",
        json={
            "amount": "10",
            "currency": "THB",
            "interval": "yearly",
            "day_of_month": 1,
        },
    )
    assert response.status_code == 422


async def test_run_due_creates_linked_expense_and_advances_schedule(client, db_sessionmaker):
    await register(client)
    sub = (
        await client.post(
            "/api/subscriptions",
            json={
                "amount": "300",
                "currency": "THB",
                "description": "Gym",
                "merchant": "Fitness First",
                "interval": "monthly",
                "day_of_month": 10,
                "start_date": "2026-08-10",
            },
        )
    ).json()

    async with db_sessionmaker() as db:
        created = await run_due(db, today=date(2026, 8, 10))
        assert len(created) == 1
        expense = created[0]
        assert expense.subscription_id == sub["id"]
        assert expense.description == "Gym"
        assert expense.merchant == "Fitness First"
        assert expense.total_minor == 30000
        assert expense.source == "subscription"

        refreshed = await db.get(Subscription, sub["id"])
        assert refreshed.next_run_on == date(2026, 9, 10)

    # Running again the same day does not double-charge
    async with db_sessionmaker() as db:
        created_again = await run_due(db, today=date(2026, 8, 10))
        assert created_again == []


async def test_run_due_catches_up_missed_periods(client, db_sessionmaker):
    await register(client)
    await client.post(
        "/api/subscriptions",
        json={
            "amount": "50",
            "currency": "THB",
            "merchant": "Cloud storage",
            "interval": "monthly",
            "day_of_month": 1,
            "start_date": "2026-06-01",
        },
    )

    async with db_sessionmaker() as db:
        created = await run_due(db, today=date(2026, 9, 1))
        assert len(created) == 4  # Jun, Jul, Aug, Sep
        months = sorted(e.spent_at.month for e in created)
        assert months == [6, 7, 8, 9]


async def test_editing_subscription_does_not_change_past_expenses(client, db_sessionmaker):
    await register(client)
    sub = (
        await client.post(
            "/api/subscriptions",
            json={
                "amount": "100",
                "currency": "THB",
                "description": "Old name",
                "interval": "monthly",
                "day_of_month": 1,
                "start_date": "2026-06-01",
            },
        )
    ).json()

    async with db_sessionmaker() as db:
        await run_due(db, today=date(2026, 6, 1))

    updated = await client.patch(
        f"/api/subscriptions/{sub['id']}",
        json={"description": "New name", "amount": "200"},
    )
    assert updated.status_code == 200
    assert updated.json()["description"] == "New name"
    assert updated.json()["amount_minor"] == 20000

    expenses = (await client.get("/api/expenses")).json()
    assert len(expenses) == 1
    assert expenses[0]["description"] == "Old name"
    assert expenses[0]["total_minor"] == 10000


async def test_delete_subscription_soft_deletes_and_keeps_expense_link(client, db_sessionmaker):
    await register(client)
    sub = (
        await client.post(
            "/api/subscriptions",
            json={
                "amount": "9.99",
                "currency": "USD",
                "merchant": "Domain renewal",
                "interval": "yearly",
                "day_of_month": 1,
                "month": 1,
                "start_date": "2026-01-01",
            },
        )
    ).json()

    async with db_sessionmaker() as db:
        await run_due(db, today=date(2026, 1, 1))

    assert (await client.delete(f"/api/subscriptions/{sub['id']}")).status_code == 204
    assert (await client.get("/api/subscriptions")).json() == []

    expenses = (await client.get("/api/expenses")).json()
    assert len(expenses) == 1
    assert expenses[0]["subscription_id"] == sub["id"]

    async with db_sessionmaker() as db:
        deleted = await db.get(Subscription, sub["id"])
        assert deleted is not None
        assert deleted.deleted_at is not None

    # A deleted subscription is never picked up again
    async with db_sessionmaker() as db:
        created = await run_due(db, today=date(2027, 1, 1))
        assert created == []


async def test_subscriptions_are_user_scoped(client, db_sessionmaker):
    await register(client, email="alice@example.com")
    sub = (
        await client.post(
            "/api/subscriptions",
            json={"amount": "10", "currency": "THB", "interval": "monthly", "day_of_month": 1},
        )
    ).json()

    await client.post("/api/auth/logout")
    await register(client, email="bob@example.com")
    assert (await client.get("/api/subscriptions")).json() == []
    assert (await client.delete(f"/api/subscriptions/{sub['id']}")).status_code == 404
    assert (
        await client.patch(f"/api/subscriptions/{sub['id']}", json={"amount": "1"})
    ).status_code == 404

    async with db_sessionmaker() as db:
        assert await db.scalar(sa.select(sa.func.count()).select_from(Subscription)) == 1
