"""Trips: an optional grouping of days, bounded by two expenses.

Nothing here infers a trip. The user marks the expense that started it (the
airport taxi) and the one that ended it; everything in that window — days,
stops, photos, spend — belongs to the trip. Membership is derived on read, so
it stays correct when the underlying expenses are edited.
"""

from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Expense, Image, Trip, User, Visit


class TripWindowError(ValueError):
    """The chosen expenses cannot bound a trip."""


@dataclass
class TripWindow:
    started_at: datetime
    ended_at: datetime


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=UTC)


def moment_of(expense: Expense) -> datetime:
    return _aware(expense.spent_at or expense.created_at)


def snap_to_days(start: datetime, end: datetime, tz_offset_minutes: int) -> TripWindow:
    """Widen a pair of moments to cover their whole local days.

    A trip groups *days*: the two expenses only say which days. Without this a
    photo taken minutes before its own receipt would fall outside the trip.
    """
    shift = timedelta(minutes=tz_offset_minutes)
    first = datetime.combine((start + shift).date(), time.min, tzinfo=UTC) - shift
    last = datetime.combine((end + shift).date(), time.max, tzinfo=UTC) - shift
    return TripWindow(started_at=first, ended_at=last)


def window_of(trip: Trip, tz_offset_minutes: int = 0) -> TripWindow:
    """The trip's span: the full local days its bounding expenses fall on."""
    return snap_to_days(
        moment_of(trip.start_expense), moment_of(trip.end_expense), tz_offset_minutes
    )


async def resolve_bounds(
    db: AsyncSession, user: User, start_expense_id: int, end_expense_id: int
) -> tuple[Expense, Expense]:
    expenses = {
        expense.id: expense
        for expense in (
            await db.execute(
                sa.select(Expense).where(
                    Expense.user_id == user.id,
                    Expense.id.in_({start_expense_id, end_expense_id}),
                )
            )
        ).scalars()
    }
    start, end = expenses.get(start_expense_id), expenses.get(end_expense_id)
    if start is None or end is None:
        raise TripWindowError("Both expenses must exist and belong to you")

    start_at = _aware(start.spent_at or start.created_at)
    end_at = _aware(end.spent_at or end.created_at)
    if end_at < start_at:
        raise TripWindowError("The ending expense comes before the starting one")
    return start, end


async def assert_no_overlap(
    db: AsyncSession,
    user: User,
    window: TripWindow,
    exclude_id: int | None,
    tz_offset_minutes: int = 0,
) -> None:
    """A day belongs to at most one trip, so windows may not overlap."""
    query = (
        sa.select(Trip)
        .where(Trip.user_id == user.id)
        .options(selectinload(Trip.start_expense), selectinload(Trip.end_expense))
    )
    if exclude_id is not None:
        query = query.where(Trip.id != exclude_id)
    for other in (await db.execute(query)).scalars():
        span = window_of(other, tz_offset_minutes)
        if window.started_at <= span.ended_at and window.ended_at >= span.started_at:
            raise TripWindowError(f"That overlaps your trip “{other.title}”")


def day_range(window: TripWindow, tz_offset_minutes: int) -> list[date]:
    """Local calendar days the window touches."""
    shift = timedelta(minutes=tz_offset_minutes)
    first = (window.started_at + shift).date()
    last = (window.ended_at + shift).date()
    return [first + timedelta(days=offset) for offset in range((last - first).days + 1)]


async def visits_in(db: AsyncSession, user: User, window: TripWindow) -> list[Visit]:
    result = await db.execute(
        sa.select(Visit)
        .where(
            Visit.user_id == user.id,
            Visit.started_at <= window.ended_at,
            Visit.ended_at >= window.started_at,
        )
        .order_by(Visit.started_at)
        .options(
            selectinload(Visit.place),
            selectinload(Visit.expenses),
            selectinload(Visit.images).selectinload(Image.analysis),
            selectinload(Visit.images).selectinload(Image.expense),
            selectinload(Visit.images).selectinload(Image.place),
        )
    )
    return list(result.scalars())


def _spent(model=Expense):
    return sa.func.coalesce(model.spent_at, model.created_at)


async def expenses_in(db: AsyncSession, user: User, window: TripWindow) -> list[Expense]:
    result = await db.execute(
        sa.select(Expense)
        .where(
            Expense.user_id == user.id,
            _spent() >= window.started_at,
            _spent() <= window.ended_at,
        )
        .order_by(_spent())
        .options(selectinload(Expense.items), selectinload(Expense.place))
    )
    return list(result.scalars())


async def trip_overlapping(
    db: AsyncSession, user: User, start: datetime, end: datetime, tz_offset_minutes: int = 0
) -> Trip | None:
    """The trip covering a given day, if the user grouped it into one."""
    query = (
        sa.select(Trip)
        .where(Trip.user_id == user.id)
        .options(selectinload(Trip.start_expense), selectinload(Trip.end_expense))
    )
    for trip in (await db.execute(query)).scalars():
        span = window_of(trip, tz_offset_minutes)
        if start <= span.ended_at and end >= span.started_at:
            return trip
    return None


async def load_trip(db: AsyncSession, user: User, trip_id: int) -> Trip | None:
    return await db.scalar(
        sa.select(Trip)
        .where(Trip.id == trip_id, Trip.user_id == user.id)
        .options(selectinload(Trip.start_expense), selectinload(Trip.end_expense))
    )
