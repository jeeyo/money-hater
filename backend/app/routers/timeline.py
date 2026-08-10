import calendar
from datetime import UTC, date, datetime, timedelta
from typing import Literal

import sqlalchemy as sa
from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.deps import CurrentUser, DbSession
from app.models import Expense, Image, Trip, User, Visit
from app.schemas import TimelineDayOut, TimelineRangeOut
from app.serialize import timeline_day_out, timeline_range_out
from app.services.trips import covers, trip_overlapping, window_of

router = APIRouter(prefix="/timeline", tags=["timeline"])


def parse_day(date_str: str) -> date:
    try:
        return datetime.strptime(date_str, "%Y-%m-%d").date()
    except ValueError as exc:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, "date must be YYYY-MM-DD"
        ) from exc


def day_window_utc(date_str: str, tz_offset_minutes: int) -> tuple[datetime, datetime]:
    """UTC window for a local calendar day. tz_offset_minutes is minutes east of UTC."""
    start = datetime.combine(parse_day(date_str), datetime.min.time(), tzinfo=UTC) - timedelta(
        minutes=tz_offset_minutes
    )
    return start, start + timedelta(days=1)


def holds_a_photo_from(start: datetime, end: datetime) -> sa.ColumnElement[bool]:
    """Does this stop hold a photo taken during the day being asked for?

    A stop's window is built from the photos that knew where they were; one
    that did not — a receipt, a plate of food — joins afterwards, by whichever
    stop is nearest in time, and that stop can be on the other side of local
    midnight. The window alone then leaves the photo on screen nowhere: not in
    the stops of the day it was taken on, because the stop is not on that day,
    and not in the unplaced list either, because it is in a stop.

    So a stop belongs to a day if its window falls in it *or* it holds a photo
    from it. This is what the week and month views have always done — they
    count photos by their own moment — and it is the reading `_days_touched`
    already takes of a stop that runs over midnight: it is on both days.
    """
    moment = sa.func.coalesce(Image.taken_at, Image.uploaded_at)
    return (
        sa.select(Image.id)
        .where(Image.visit_id == Visit.id, moment >= start, moment < end)
        .exists()
    )


def span_days(date_str: str, span: str) -> list[date]:
    """The local days of the week or month the given day falls in.

    Weeks run Monday to Sunday — the ISO week, and the one the calendar grid is
    laid out on. Months are the calendar month, whatever its length.
    """
    day = parse_day(date_str)
    if span == "week":
        first = day - timedelta(days=day.weekday())
        length = 7
    else:
        first = day.replace(day=1)
        length = calendar.monthrange(day.year, day.month)[1]
    return [first + timedelta(days=offset) for offset in range(length)]


@router.get("", response_model=TimelineDayOut)
async def get_timeline(
    user: CurrentUser,
    db: DbSession,
    date: str = Query(description="Local calendar day, YYYY-MM-DD"),
    tz_offset_minutes: int = Query(default=0, ge=-840, le=840),
):
    """One day: the stops you made, plus what you spent."""
    start, end = day_window_utc(date, tz_offset_minutes)

    visits = (
        (
            await db.execute(
                sa.select(Visit)
                .where(
                    Visit.user_id == user.id,
                    sa.or_(
                        sa.and_(Visit.started_at < end, Visit.ended_at >= start),
                        holds_a_photo_from(start, end),
                    ),
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
        )
        .scalars()
        .all()
    )

    effective = sa.func.coalesce(Image.taken_at, Image.uploaded_at)
    unassigned = (
        (
            await db.execute(
                sa.select(Image)
                .where(
                    Image.user_id == user.id,
                    Image.visit_id.is_(None),
                    effective >= start,
                    effective < end,
                )
                .order_by(effective)
                .options(
                    selectinload(Image.place),
                    selectinload(Image.analysis),
                    selectinload(Image.expense),
                )
            )
        )
        .scalars()
        .all()
    )

    spent = sa.func.coalesce(Expense.spent_at, Expense.created_at)
    expenses = (
        (
            await db.execute(
                sa.select(Expense).where(
                    Expense.user_id == user.id, spent >= start, spent < end
                )
            )
        )
        .scalars()
        .all()
    )

    trip = await trip_overlapping(db, user, start, end, tz_offset_minutes)
    return timeline_day_out(
        date, trip, list(visits), list(unassigned), list(expenses), user.preferred_currency
    )


async def trips_by_day(
    db: AsyncSession, user: User, days: list[date], tz_offset_minutes: int
) -> dict[str, Trip]:
    """Which trip, if any, each local day belongs to.

    Trip membership is derived from the bounding expenses rather than stored,
    so the windows are computed here and matched against the days — the same
    overlap `trip_overlapping` does for a single day, done once for the span.
    """
    trips = (
        (
            await db.execute(
                sa.select(Trip)
                .where(Trip.user_id == user.id)
                .options(selectinload(Trip.start_expense), selectinload(Trip.end_expense))
            )
        )
        .scalars()
        .all()
    )
    windows = [(trip, window_of(trip, tz_offset_minutes)) for trip in trips]

    found: dict[str, Trip] = {}
    for day in days:
        start, end = day_window_utc(day.isoformat(), tz_offset_minutes)
        for trip, window in windows:
            if covers(window, start, end):
                found[day.isoformat()] = trip
                break
    return found


@router.get("/range", response_model=TimelineRangeOut)
async def get_timeline_range(
    user: CurrentUser,
    db: DbSession,
    date: str = Query(description="Any local day inside the wanted span, YYYY-MM-DD"),
    span: Literal["week", "month"] = Query(default="week"),
    tz_offset_minutes: int = Query(default=0, ge=-840, le=840),
):
    """A week or a month at a glance: one summary per day, empty days included."""
    days = span_days(date, span)
    start, _ = day_window_utc(days[0].isoformat(), tz_offset_minutes)
    _, end = day_window_utc(days[-1].isoformat(), tz_offset_minutes)

    visits = (
        (
            await db.execute(
                sa.select(Visit)
                .where(
                    Visit.user_id == user.id,
                    Visit.started_at < end,
                    Visit.ended_at >= start,
                )
                .order_by(Visit.started_at)
                .options(selectinload(Visit.place))
            )
        )
        .scalars()
        .all()
    )

    # Photos are grouped by when they happened rather than by their visit, so
    # the ones no stop claimed still count towards the day they were taken on.
    effective = sa.func.coalesce(Image.taken_at, Image.uploaded_at)
    images = (
        (
            await db.execute(
                sa.select(Image)
                .where(Image.user_id == user.id, effective >= start, effective < end)
                .order_by(effective)
                .options(
                    selectinload(Image.place),
                    selectinload(Image.analysis),
                    selectinload(Image.expense),
                )
            )
        )
        .scalars()
        .all()
    )

    spent = sa.func.coalesce(Expense.spent_at, Expense.created_at)
    expenses = (
        (
            await db.execute(
                sa.select(Expense).where(
                    Expense.user_id == user.id, spent >= start, spent < end
                )
            )
        )
        .scalars()
        .all()
    )

    return timeline_range_out(
        span,
        days,
        await trips_by_day(db, user, days, tz_offset_minutes),
        list(visits),
        list(images),
        list(expenses),
        user.preferred_currency,
        tz_offset_minutes,
    )
