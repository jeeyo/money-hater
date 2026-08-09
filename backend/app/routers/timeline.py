from datetime import UTC, datetime, timedelta

import sqlalchemy as sa
from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy.orm import selectinload

from app.deps import CurrentUser, DbSession
from app.models import Expense, Image, Visit
from app.schemas import TimelineDayOut
from app.serialize import timeline_day_out
from app.services.trips import trip_overlapping

router = APIRouter(prefix="/timeline", tags=["timeline"])


def day_window_utc(date_str: str, tz_offset_minutes: int) -> tuple[datetime, datetime]:
    """UTC window for a local calendar day. tz_offset_minutes is minutes east of UTC."""
    try:
        day = datetime.strptime(date_str, "%Y-%m-%d")
    except ValueError as exc:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, "date must be YYYY-MM-DD"
        ) from exc
    start = day.replace(tzinfo=UTC) - timedelta(minutes=tz_offset_minutes)
    return start, start + timedelta(days=1)


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
                    Visit.started_at < end,
                    Visit.ended_at >= start,
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
                    # A day is a record of where you were, so a photo with no
                    # location has nothing to say in it. Upload refuses these
                    # now; this keeps the ones that got in before it did from
                    # sitting on today under "not yet placed" for good.
                    Image.lat.isnot(None),
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
