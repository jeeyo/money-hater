import sqlalchemy as sa
from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy.orm import selectinload

from app.deps import CurrentUser, DbSession
from app.models import Image, Trip, Visit
from app.schemas import (
    TripDetailOut,
    TripMergeRequest,
    TripOut,
    TripUpdate,
    VisitOut,
    VisitUpdate,
)
from app.serialize import trip_detail_out, trip_out, visit_out
from app.services.clustering import load_trip_detail
from app.services.places import search_place_by_text

router = APIRouter(tags=["trips"])

_TRIP_LOADS = (
    selectinload(Trip.visits).selectinload(Visit.place),
    selectinload(Trip.visits).selectinload(Visit.expenses),
    selectinload(Trip.visits).selectinload(Visit.images).selectinload(Image.analysis),
    selectinload(Trip.visits).selectinload(Visit.images).selectinload(Image.expense),
    selectinload(Trip.visits).selectinload(Visit.images).selectinload(Image.place),
)


async def _get_owned_trip(db: DbSession, user_id: int, trip_id: int) -> Trip:
    trip = await db.scalar(
        sa.select(Trip).where(Trip.id == trip_id, Trip.user_id == user_id).options(*_TRIP_LOADS)
    )
    if trip is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Trip not found")
    return trip


@router.get("/trips", response_model=list[TripOut])
async def list_trips(
    user: CurrentUser,
    db: DbSession,
    limit: int = Query(default=50, le=200),
    offset: int = 0,
):
    trips = (
        (
            await db.execute(
                sa.select(Trip)
                .where(Trip.user_id == user.id)
                .order_by(Trip.started_at.desc())
                .limit(limit)
                .offset(offset)
                .options(*_TRIP_LOADS)
            )
        )
        .scalars()
        .all()
    )
    return [trip_out(trip, user.preferred_currency) for trip in trips]


@router.get("/trips/{trip_id}", response_model=TripDetailOut)
async def get_trip(trip_id: int, user: CurrentUser, db: DbSession):
    return trip_detail_out(await _get_owned_trip(db, user.id, trip_id), user.preferred_currency)


@router.patch("/trips/{trip_id}", response_model=TripDetailOut)
async def update_trip(trip_id: int, body: TripUpdate, user: CurrentUser, db: DbSession):
    trip = await _get_owned_trip(db, user.id, trip_id)
    if body.title is not None:
        trip.title = body.title or None
    if body.kind is not None:
        trip.kind = body.kind
    trip.pinned = True
    await db.commit()
    return trip_detail_out(trip, user.preferred_currency)


@router.post("/trips/{trip_id}/merge", response_model=TripDetailOut)
async def merge_trips(
    trip_id: int, body: TripMergeRequest, user: CurrentUser, db: DbSession
):
    trip = await _get_owned_trip(db, user.id, trip_id)
    other = await _get_owned_trip(db, user.id, body.other_trip_id)
    if other.id == trip.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot merge a trip with itself")
    await db.execute(sa.update(Visit).where(Visit.trip_id == other.id).values(trip_id=trip.id))
    trip.started_at = min(trip.started_at, other.started_at)
    trip.ended_at = max(trip.ended_at, other.ended_at)
    trip.pinned = True
    await db.delete(other)
    await db.commit()
    db.expire_all()
    refreshed = await load_trip_detail(db, trip.id)
    return trip_detail_out(refreshed, user.preferred_currency)


@router.delete("/trips/{trip_id}", status_code=204)
async def delete_trip(trip_id: int, user: CurrentUser, db: DbSession):
    """Delete a trip grouping (images stay, detached from visits)."""
    trip = await _get_owned_trip(db, user.id, trip_id)
    visit_ids = [visit.id for visit in trip.visits]
    if visit_ids:
        await db.execute(
            sa.update(Image).where(Image.visit_id.in_(visit_ids)).values(visit_id=None)
        )
    await db.delete(trip)
    await db.commit()


@router.patch("/visits/{visit_id}", response_model=VisitOut)
async def update_visit(visit_id: int, body: VisitUpdate, user: CurrentUser, db: DbSession):
    visit = await db.scalar(
        sa.select(Visit)
        .where(Visit.id == visit_id, Visit.user_id == user.id)
        .options(
            selectinload(Visit.place),
            selectinload(Visit.expenses),
            selectinload(Visit.images).selectinload(Image.analysis),
            selectinload(Visit.images).selectinload(Image.expense),
            selectinload(Visit.images).selectinload(Image.place),
        )
    )
    if visit is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Visit not found")
    if body.label_override is not None:
        visit.label_override = body.label_override or None
    if body.google_place_id is not None:
        place = await search_place_by_text(db, body.google_place_id)
        if place is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "No matching place found")
        visit.place_id = place.id
    visit.pinned = True
    await db.commit()
    await db.refresh(visit)
    return visit_out(visit, user.preferred_currency)
