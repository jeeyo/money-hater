"""Itinerary reconstruction: images -> visits -> trips.

Deterministic spatiotemporal clustering, re-run after every analyzed image:
- consecutive images join the same *visit* while the time gap stays under
  VISIT_MAX_GAP and GPS distance under VISIT_MAX_DISTANCE;
- consecutive visits chain into a *trip* while the gap stays under TRIP_MAX_GAP.

User edits are preserved: a pinned visit (or pinned trip) protects the whole
trip — its images are excluded from re-clustering and the trip is not rebuilt.
"""

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.models import Expense, Image, Place, Trip, User, Visit
from app.services.geo import haversine_m


@dataclass
class Point:
    id: int
    ts: datetime
    lat: float | None
    lng: float | None
    place_id: int | None = None


def group_into_visits(
    points: list[Point], max_gap: timedelta, max_distance_m: float
) -> list[list[Point]]:
    """Group time-sorted points into visit clusters (pure, unit-tested)."""
    groups: list[list[Point]] = []
    last_gps: Point | None = None
    for point in sorted(points, key=lambda p: p.ts):
        if groups:
            prev = groups[-1][-1]
            too_late = point.ts - prev.ts > max_gap
            too_far = (
                point.lat is not None
                and last_gps is not None
                and haversine_m(point.lat, point.lng, last_gps.lat, last_gps.lng) > max_distance_m
            )
        else:
            too_late = too_far = True
        if too_late or too_far:
            groups.append([point])
            last_gps = None
        else:
            groups[-1].append(point)
        if point.lat is not None:
            last_gps = point
    return groups


def group_into_trips(spans: list[tuple[datetime, datetime]], max_gap: timedelta) -> list[list[int]]:
    """Group visit index spans (sorted by start) into trip chains (pure, unit-tested)."""
    trips: list[list[int]] = []
    for index, (start, _end) in enumerate(spans):
        if trips and start - spans[trips[-1][-1]][1] <= max_gap:
            trips[-1].append(index)
        else:
            trips.append([index])
    return trips


def _centroid(points: list[Point]) -> tuple[float | None, float | None]:
    gps = [(p.lat, p.lng) for p in points if p.lat is not None]
    if not gps:
        return None, None
    return sum(p[0] for p in gps) / len(gps), sum(p[1] for p in gps) / len(gps)


def _dominant_place(points: list[Point]) -> int | None:
    counts: dict[int, int] = {}
    for point in points:
        if point.place_id is not None:
            counts[point.place_id] = counts.get(point.place_id, 0) + 1
    return max(counts, key=counts.get) if counts else None  # type: ignore[arg-type]


def _trip_kind(user: User, visits: list[Visit]) -> str:
    starts = visits[0].started_at
    ends = visits[-1].ended_at
    coords = [(v.lat, v.lng) for v in visits if v.lat is not None]
    max_spread = 0.0
    for i in range(len(coords)):
        for j in range(i + 1, len(coords)):
            max_spread = max(
                max_spread, haversine_m(coords[i][0], coords[i][1], coords[j][0], coords[j][1])
            )
    if ends - starts >= timedelta(hours=24) or max_spread > 50_000:
        return "trip"
    if user.home_lat is not None and len(visits) >= 2 and ends - starts <= timedelta(hours=3):
        def near_home(v: Visit) -> bool:
            return (
                v.lat is not None
                and haversine_m(v.lat, v.lng, user.home_lat, user.home_lng)
                <= settings.home_radius_m
            )

        if near_home(visits[0]) or near_home(visits[-1]):
            return "commute"
    return "outing"


async def _auto_title(db: AsyncSession, visits: list[Visit]) -> str:
    place_ids = [v.place_id for v in visits if v.place_id is not None]
    if not place_ids:
        return "Trip" if len(visits) > 1 else "Stop"
    names: list[str] = []
    result = await db.execute(sa.select(Place).where(Place.id.in_(place_ids)))
    by_id = {p.id: p.name for p in result.scalars()}
    for pid in place_ids:
        name = by_id.get(pid)
        if name and name not in names:
            names.append(name)
    title = names[0]
    extra = len(visits) - 1
    return f"{title} +{extra} stop{'s' if extra > 1 else ''}" if extra > 0 else title


def effective_ts(image: Image) -> datetime:
    # sqlite returns naive datetimes; normalize so comparisons never mix awareness
    ts = image.taken_at or image.uploaded_at
    return ts if ts.tzinfo else ts.replace(tzinfo=UTC)


async def recluster_user(db: AsyncSession, user: User) -> None:
    # Trips protected by a pin (their own or any member visit's) are untouched
    protected_trip_ids = set(
        (
            await db.execute(
                sa.select(Trip.id)
                .outerjoin(Visit, Visit.trip_id == Trip.id)
                .where(Trip.user_id == user.id)
                .where(sa.or_(Trip.pinned.is_(True), Visit.pinned.is_(True)))
            )
        ).scalars()
    )
    protected_visit_ids = set(
        (
            await db.execute(sa.select(Visit.id).where(Visit.trip_id.in_(protected_trip_ids)))
        ).scalars()
    ) if protected_trip_ids else set()

    images = (
        (
            await db.execute(
                sa.select(Image).where(
                    Image.user_id == user.id,
                    Image.status != "pending",
                    sa.or_(
                        Image.visit_id.is_(None), Image.visit_id.notin_(protected_visit_ids)
                    ) if protected_visit_ids else sa.true(),
                )
            )
        )
        .scalars()
        .all()
    )

    # Wipe unprotected trips (visits cascade); detach their images first
    await db.execute(
        sa.update(Image)
        .where(Image.user_id == user.id)
        .where(
            Image.visit_id.notin_(protected_visit_ids) if protected_visit_ids else sa.true()
        )
        .values(visit_id=None)
    )
    # Delete visits explicitly rather than relying on FK cascade (sqlite tests
    # run without the foreign_keys pragma guarantee)
    delete_visits = sa.delete(Visit).where(Visit.user_id == user.id)
    delete_trips = sa.delete(Trip).where(Trip.user_id == user.id)
    if protected_visit_ids:
        delete_visits = delete_visits.where(Visit.id.notin_(protected_visit_ids))
    if protected_trip_ids:
        delete_trips = delete_trips.where(Trip.id.notin_(protected_trip_ids))
    await db.execute(delete_visits)
    await db.execute(delete_trips)

    points = [
        Point(id=i.id, ts=effective_ts(i), lat=i.lat, lng=i.lng, place_id=i.place_id)
        for i in images
    ]
    if not points:
        await db.commit()
        return

    visit_groups = group_into_visits(
        points,
        max_gap=timedelta(minutes=settings.visit_max_gap_minutes),
        max_distance_m=settings.visit_max_distance_m,
    )
    spans = [(g[0].ts, g[-1].ts) for g in visit_groups]
    trip_groups = group_into_trips(spans, max_gap=timedelta(hours=settings.trip_max_gap_hours))

    for trip_indices in trip_groups:
        trip = Trip(
            user_id=user.id,
            started_at=spans[trip_indices[0]][0],
            ended_at=spans[trip_indices[-1]][1],
        )
        db.add(trip)
        await db.flush()
        trip_visits: list[Visit] = []
        for index in trip_indices:
            group = visit_groups[index]
            lat, lng = _centroid(group)
            visit = Visit(
                trip_id=trip.id,
                user_id=user.id,
                place_id=_dominant_place(group),
                started_at=group[0].ts,
                ended_at=group[-1].ts,
                lat=lat,
                lng=lng,
            )
            db.add(visit)
            await db.flush()
            trip_visits.append(visit)
            image_ids = [p.id for p in group]
            await db.execute(
                sa.update(Image).where(Image.id.in_(image_ids)).values(visit_id=visit.id)
            )
            await db.execute(
                sa.update(Expense)
                .where(Expense.image_id.in_(image_ids))
                .values(visit_id=visit.id)
            )
        trip.auto_title = await _auto_title(db, trip_visits)
        trip.kind = _trip_kind(user, trip_visits)

    await db.commit()


async def load_trip_detail(db: AsyncSession, trip_id: int) -> Trip | None:
    return await db.scalar(
        sa.select(Trip)
        .where(Trip.id == trip_id)
        .options(
            selectinload(Trip.visits).selectinload(Visit.place),
            selectinload(Trip.visits)
            .selectinload(Visit.images)
            .selectinload(Image.analysis),
            selectinload(Trip.visits)
            .selectinload(Visit.images)
            .selectinload(Image.expense),
            selectinload(Trip.visits).selectinload(Visit.images).selectinload(Image.place),
        )
    )
