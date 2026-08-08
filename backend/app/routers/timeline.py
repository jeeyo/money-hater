from datetime import UTC, datetime, timedelta

import sqlalchemy as sa
from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy.orm import selectinload

from app.deps import CurrentUser, DbSession
from app.models import Expense, Image, Trip, Visit
from app.schemas import TimelineDayOut
from app.serialize import timeline_day_out

router = APIRouter(prefix="/timeline", tags=["timeline"])


def day_window_utc(date_str: str, tz_offset_minutes: int) -> tuple[datetime, datetime]:
    """UTC window for a local calendar day. tz_offset_minutes is minutes east of UTC."""
    try:
        day = datetime.strptime(date_str, "%Y-%m-%d")
    except ValueError as exc:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, "date must be YYYY-MM-DD"
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
    start, end = day_window_utc(date, tz_offset_minutes)

    trips = (
        (
            await db.execute(
                sa.select(Trip)
                .where(Trip.user_id == user.id, Trip.started_at < end, Trip.ended_at >= start)
                .order_by(Trip.started_at)
                .options(
                    selectinload(Trip.visits).selectinload(Visit.place),
                    selectinload(Trip.visits)
                    .selectinload(Visit.images)
                    .selectinload(Image.analysis),
                    selectinload(Trip.visits)
                    .selectinload(Visit.images)
                    .selectinload(Image.expense),
                    selectinload(Trip.visits)
                    .selectinload(Visit.images)
                    .selectinload(Image.place),
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

    return timeline_day_out(date, trips, unassigned, expenses)
