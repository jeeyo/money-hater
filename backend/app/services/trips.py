"""Trips: an optional grouping of days, bounded by two expenses.

Nothing here infers a trip. The user marks the expense that started it (the
airport taxi) and the one that ended it; everything in that window — days,
stops, photos, spend — belongs to the trip. Membership is derived on read, so
it stays correct when the underlying expenses are edited.

A trip can also be *open*: named when you set off, with no ending expense yet.
Its window runs to now, and because membership is derived rather than stored,
today falls into it without anything having to update the row.
"""

from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Expense, Image, Trip, User, Visit
from app.services.localtime import local_now


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


def snap_to_days(start: datetime, end: datetime) -> TripWindow:
    """Widen a pair of moments to cover their whole local days.

    A trip groups *days*: the two expenses only say which days. Without this a
    photo taken minutes before its own receipt would fall outside the trip.

    Both moments are already local wall clocks
    (`app.services.localtime`), so the days are read straight off them.
    """
    first = datetime.combine(start.date(), time.min, tzinfo=UTC)
    last = datetime.combine(end.date(), time.max, tzinfo=UTC)
    return TripWindow(started_at=first, ended_at=last)


def is_open(trip: Trip) -> bool:
    """No ending expense yet — the trip is still running."""
    return trip.end_expense_id is None


def window_of(trip: Trip, tz_offset_minutes: int = 0, now: datetime | None = None) -> TripWindow:
    """The trip's span: the full local days its bounding expenses fall on.

    An open trip has no ending expense, so it runs to ``now`` — today's local
    day — and grows by itself. ``now`` is injectable so tests can pin it.

    ``tz_offset_minutes`` is needed for that ``now`` alone: the server's clock
    is a real instant and the expenses either side of it are local wall clocks,
    so it is read on the user's wall before the two are compared. A closed trip
    never touches it.
    """
    ends_at = (
        moment_of(trip.end_expense)
        if trip.end_expense is not None
        else local_now(tz_offset_minutes, now)
    )
    return snap_to_days(moment_of(trip.start_expense), ends_at)


async def resolve_bounds(
    db: AsyncSession,
    user: User,
    start_expense_id: int,
    end_expense_id: int | None,
    tz_offset_minutes: int = 0,
    now: datetime | None = None,
) -> tuple[Expense, Expense | None]:
    """Load the bounding expenses. A missing end means an open trip."""
    wanted = {start_expense_id} | ({end_expense_id} if end_expense_id is not None else set())
    expenses = {
        expense.id: expense
        for expense in (
            await db.execute(
                sa.select(Expense).where(Expense.user_id == user.id, Expense.id.in_(wanted))
            )
        ).scalars()
    }
    start = expenses.get(start_expense_id)
    end = expenses.get(end_expense_id) if end_expense_id is not None else None
    if start is None or (end_expense_id is not None and end is None):
        raise TripWindowError("Both expenses must exist and belong to you")

    start_at = moment_of(start)
    if end is None:
        # An open trip ends now, so a start in the future cannot bound anything.
        # "Future" is measured on the user's wall clock — east of the server,
        # everything spent this evening reads as tomorrow otherwise.
        if start_at > local_now(tz_offset_minutes, now):
            raise TripWindowError("An ongoing trip cannot start in the future")
        return start, None
    if moment_of(end) < start_at:
        raise TripWindowError("The ending expense comes before the starting one")
    return start, end


async def latest_expense_in(db: AsyncSession, user: User, window: TripWindow) -> Expense | None:
    """The most recent expense in the window — what "end trip now" picks.

    Worst case that is the trip's own starting expense, so a trip opened today
    can still be ended today.
    """
    return await db.scalar(
        sa.select(Expense)
        .where(
            Expense.user_id == user.id,
            _spent() >= window.started_at,
            _spent() <= window.ended_at,
        )
        .order_by(_spent().desc(), Expense.id.desc())
        .limit(1)
    )


async def latest_visit_in(
    db: AsyncSession,
    user: User,
    window: TripWindow,
    tz_offset_minutes: int = 0,
    now: datetime | None = None,
) -> Visit | None:
    """The last stop with coordinates — where "what's near me?" starts from.

    Clamped to now as well as to the window: you cannot be standing somewhere
    you have not been to yet, and a photo stamped later today would otherwise
    make the trip look like it had already moved on. The stops are wall clocks,
    so the clamp is the user's wall clock too.
    """
    moment = local_now(tz_offset_minutes, now)
    return await db.scalar(
        sa.select(Visit)
        .where(
            Visit.user_id == user.id,
            Visit.started_at <= window.ended_at,
            Visit.ended_at >= window.started_at,
            Visit.started_at <= moment,
            Visit.lat.isnot(None),
        )
        .order_by(Visit.started_at.desc())
        .options(selectinload(Visit.place))
        .limit(1)
    )


async def assert_no_other_open_trip(
    db: AsyncSession, user: User, exclude_id: int | None = None
) -> None:
    """"The trip I am on right now" is singular, so only one may be open."""
    query = sa.select(Trip).where(Trip.user_id == user.id, Trip.end_expense_id.is_(None))
    if exclude_id is not None:
        query = query.where(Trip.id != exclude_id)
    other = await db.scalar(query.limit(1))
    if other is not None:
        raise TripWindowError(f"“{other.title}” is still going — end it first")


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


def covers(window: TripWindow, start: datetime, end: datetime) -> bool:
    """Does the trip's span meet the half-open UTC range ``[start, end)``?

    Half-open matters at the seam: a calendar day runs to the next midnight,
    which is the same instant a trip starting the following morning is snapped
    back to. Comparing that end inclusively put the day *before* a trip inside
    it, so the timeline offered to show you a trip you had not left for yet.
    """
    return start <= window.ended_at and end > window.started_at


def day_range(window: TripWindow) -> list[date]:
    """Local calendar days the window touches — it is snapped to them already."""
    first = window.started_at.date()
    last = window.ended_at.date()
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
            selectinload(Visit.expenses).options(
                selectinload(Expense.items), selectinload(Expense.place)
            ),
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
        if covers(window_of(trip, tz_offset_minutes), start, end):
            return trip
    return None


async def load_trip(db: AsyncSession, user: User, trip_id: int) -> Trip | None:
    return await db.scalar(
        sa.select(Trip)
        .where(Trip.id == trip_id, Trip.user_id == user.id)
        .options(selectinload(Trip.start_expense), selectinload(Trip.end_expense))
    )
