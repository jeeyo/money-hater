"""Recurring charges: a subscription describes one, a periodic job turns it
into a real expense on each due date.

An expense created this way is created exactly like a manual one — same
currency handling, same place resolution, same visit attachment — plus a
`subscription_id` back-link. Nothing about it is special once it exists.
"""

import calendar
from datetime import UTC, date, datetime, time

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Expense, Subscription, User
from app.services.expenses import create_expense


def _clamp_day(year: int, month: int, day: int) -> int:
    """The day of the month, pulled back to the last real day if it overshoots
    — a subscription anchored on the 31st still fires in April, on the 30th."""
    return min(day, calendar.monthrange(year, month)[1])


def next_occurrence(
    interval: str, day_of_month: int, month: int | None, *, on_or_after: date
) -> date:
    """The next date on or after `on_or_after` that matches the schedule."""
    if interval == "monthly":
        year, mon = on_or_after.year, on_or_after.month
        candidate = date(year, mon, _clamp_day(year, mon, day_of_month))
        if candidate < on_or_after:
            year, mon = on_or_after.year, on_or_after.month + 1
            if mon == 13:
                year, mon = year + 1, 1
            candidate = date(year, mon, _clamp_day(year, mon, day_of_month))
        return candidate

    assert month is not None
    candidate = date(on_or_after.year, month, _clamp_day(on_or_after.year, month, day_of_month))
    if candidate < on_or_after:
        candidate = date(
            on_or_after.year + 1, month, _clamp_day(on_or_after.year + 1, month, day_of_month)
        )
    return candidate


def advance(occurred_on: date, interval: str, day_of_month: int, month: int | None) -> date:
    """The following occurrence after one that just fired — computed from the
    fired date itself, not from "today", so a late-running job never drifts
    the schedule off the day the user picked."""
    if interval == "monthly":
        year, mon = occurred_on.year, occurred_on.month + 1
        if mon == 13:
            year, mon = year + 1, 1
        return date(year, mon, _clamp_day(year, mon, day_of_month))

    assert month is not None
    return date(occurred_on.year + 1, month, _clamp_day(occurred_on.year + 1, month, day_of_month))


async def run_due(db: AsyncSession, *, today: date | None = None) -> list[Expense]:
    """Create an expense for every subscription due on or before `today`.

    A subscription that missed more than one period (the job was down for a
    while) catches up one expense per missed period rather than skipping
    straight to the latest — each is a real charge that happened.
    """
    today = today or datetime.now(UTC).date()
    subscriptions = (
        (
            await db.execute(
                sa.select(Subscription).where(
                    Subscription.deleted_at.is_(None),
                    Subscription.next_run_on <= today,
                )
            )
        )
        .scalars()
        .all()
    )

    created: list[Expense] = []
    for subscription in subscriptions:
        user = await db.get(User, subscription.user_id)
        if user is None:
            continue
        while subscription.next_run_on <= today:
            expense = await create_expense(
                db,
                user,
                total_minor=subscription.amount_minor,
                currency=subscription.currency,
                description=subscription.description,
                merchant=subscription.merchant,
                place_id=subscription.place_id,
                spent_at=datetime.combine(subscription.next_run_on, time.min, tzinfo=UTC),
                note=subscription.note,
                source="subscription",
            )
            expense.subscription_id = subscription.id
            created.append(expense)
            subscription.next_run_on = advance(
                subscription.next_run_on,
                subscription.interval,
                subscription.day_of_month,
                subscription.month,
            )
    await db.commit()
    return created
