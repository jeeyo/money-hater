import sqlalchemy as sa
from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy.orm import selectinload

from app.deps import CurrentUser, DbSession
from app.models import Image, Trip, Visit
from app.schemas import (
    TripCreate,
    TripDetailOut,
    TripOut,
    TripUpdate,
    VisitOut,
    VisitUpdate,
)
from app.serialize import trip_detail_out, trip_out, visit_out
from app.services import trips as trip_service
from app.services.places import search_place_by_text
from app.services.trips import TripWindowError

router = APIRouter(tags=["trips"])


async def _load(db: DbSession, user, trip_id: int) -> Trip:
    trip = await trip_service.load_trip(db, user, trip_id)
    if trip is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Trip not found")
    return trip


async def _render(db: DbSession, user, trip: Trip, tz_offset_minutes: int, detail: bool):
    window = trip_service.window_of(trip, tz_offset_minutes)
    visits = await trip_service.visits_in(db, user, window)
    expenses = await trip_service.expenses_in(db, user, window)
    render = trip_detail_out if detail else trip_out
    return render(trip, window, visits, expenses, user.preferred_currency, tz_offset_minutes)


@router.get("/trips", response_model=list[TripOut])
async def list_trips(
    user: CurrentUser,
    db: DbSession,
    tz_offset_minutes: int = Query(default=0, ge=-840, le=840),
):
    trips = (
        (
            await db.execute(
                sa.select(Trip)
                .where(Trip.user_id == user.id)
                .options(
                    selectinload(Trip.start_expense), selectinload(Trip.end_expense)
                )
            )
        )
        .scalars()
        .all()
    )
    rendered = [await _render(db, user, trip, tz_offset_minutes, detail=False) for trip in trips]
    return sorted(rendered, key=lambda t: t.started_at, reverse=True)


@router.post("/trips", response_model=TripDetailOut, status_code=201)
async def create_trip(
    body: TripCreate,
    user: CurrentUser,
    db: DbSession,
    tz_offset_minutes: int = Query(default=0, ge=-840, le=840),
):
    """Group everything between two expenses into a named trip."""
    try:
        start, end = await trip_service.resolve_bounds(
            db, user, body.start_expense_id, body.end_expense_id
        )
        await trip_service.assert_no_overlap(
            db,
            user,
            trip_service.snap_to_days(
                trip_service.moment_of(start), trip_service.moment_of(end), tz_offset_minutes
            ),
            exclude_id=None,
            tz_offset_minutes=tz_offset_minutes,
        )
    except TripWindowError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc

    trip = Trip(
        user_id=user.id,
        title=body.title.strip(),
        start_expense_id=start.id,
        end_expense_id=end.id,
        note=body.note or None,
    )
    db.add(trip)
    await db.commit()
    return await _render(db, user, await _load(db, user, trip.id), tz_offset_minutes, detail=True)


@router.get("/trips/{trip_id}", response_model=TripDetailOut)
async def get_trip(
    trip_id: int,
    user: CurrentUser,
    db: DbSession,
    tz_offset_minutes: int = Query(default=0, ge=-840, le=840),
):
    return await _render(db, user, await _load(db, user, trip_id), tz_offset_minutes, detail=True)


@router.patch("/trips/{trip_id}", response_model=TripDetailOut)
async def update_trip(
    trip_id: int,
    body: TripUpdate,
    user: CurrentUser,
    db: DbSession,
    tz_offset_minutes: int = Query(default=0, ge=-840, le=840),
):
    trip = await _load(db, user, trip_id)
    if body.title is not None:
        trip.title = body.title.strip()
    if body.note is not None or "note" in body.model_fields_set:
        trip.note = body.note or None

    if body.start_expense_id is not None or body.end_expense_id is not None:
        try:
            start, end = await trip_service.resolve_bounds(
                db,
                user,
                body.start_expense_id or trip.start_expense_id,
                body.end_expense_id or trip.end_expense_id,
            )
            await trip_service.assert_no_overlap(
                db,
                user,
                trip_service.snap_to_days(
                    trip_service.moment_of(start), trip_service.moment_of(end), tz_offset_minutes
                ),
                exclude_id=trip.id,
                tz_offset_minutes=tz_offset_minutes,
            )
        except TripWindowError as exc:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc
        trip.start_expense_id, trip.end_expense_id = start.id, end.id

    await db.commit()
    # The session keeps objects unexpired on commit, so the bounds would
    # otherwise still render from the relationships loaded before the change.
    await db.refresh(trip, attribute_names=["start_expense", "end_expense"])
    return await _render(db, user, trip, tz_offset_minutes, detail=True)


@router.delete("/trips/{trip_id}", status_code=204)
async def delete_trip(trip_id: int, user: CurrentUser, db: DbSession):
    """Ungroup. The days, stops and expenses inside are untouched."""
    trip = await _load(db, user, trip_id)
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
