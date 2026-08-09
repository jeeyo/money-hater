"""Itinerary reconstruction: images -> visits.

Deterministic spatiotemporal clustering, re-run after every analyzed image:
consecutive images join the same *visit* while the time gap stays under
VISIT_MAX_GAP and the GPS distance under VISIT_MAX_DISTANCE.

Days are the automatic unit above a visit — a day is simply the visits that
fall in it. Trips are never inferred; they are made by hand (see app.models.Trip).

A pinned visit is one the user has edited, so it and its images are left out
of re-clustering entirely.
"""

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import Expense, Image, User, Visit
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


def _centroid(points: list[Point]) -> tuple[float | None, float | None]:
    gps = [(p.lat, p.lng) for p in points if p.lat is not None]
    if not gps:
        return None, None
    return sum(p[0] for p in gps) / len(gps), sum(p[1] for p in gps) / len(gps)


def dominant_place(place_ids: Iterable[int | None]) -> int | None:
    """The place a group of photos is mostly of — what names the stop."""
    counts: dict[int, int] = {}
    for place_id in place_ids:
        if place_id is not None:
            counts[place_id] = counts.get(place_id, 0) + 1
    return max(counts, key=counts.get) if counts else None  # type: ignore[arg-type]


def effective_ts(image: Image) -> datetime:
    # sqlite returns naive datetimes; normalize so comparisons never mix awareness
    ts = image.taken_at or image.uploaded_at
    return ts if ts.tzinfo else ts.replace(tzinfo=UTC)


async def refresh_visit_place(db: AsyncSession, visit_id: int) -> None:
    """Re-derive one stop's place from the places of the photos in it.

    The narrow counterpart to recluster_user, for when only a place changed:
    grouping is decided by time and GPS alone, so no photo can move between
    stops and rebuilding them all would only hand out fresh ids for stops that
    did not change. Pinned stops are the user's own edit and stay untouched.
    """
    visit = await db.get(Visit, visit_id)
    if visit is None or visit.pinned:
        return
    place_ids = (
        await db.execute(sa.select(Image.place_id).where(Image.visit_id == visit_id))
    ).scalars()
    visit.place_id = dominant_place(place_ids)
    await db.commit()


async def recluster_user(db: AsyncSession, user: User) -> None:
    """Rebuild this user's visits from their analyzed images.

    Idempotent: safe to run after every upload. Visits the user has edited are
    pinned, so they and their images are left exactly as they are.
    """
    protected_visit_ids = set(
        (
            await db.execute(
                sa.select(Visit.id).where(Visit.user_id == user.id, Visit.pinned.is_(True))
            )
        ).scalars()
    )
    unprotected = (
        sa.or_(Image.visit_id.is_(None), Image.visit_id.notin_(protected_visit_ids))
        if protected_visit_ids
        else sa.true()
    )

    images = (
        (
            await db.execute(
                sa.select(Image).where(
                    Image.user_id == user.id, Image.status != "pending", unprotected
                )
            )
        )
        .scalars()
        .all()
    )

    # Detach then delete the rebuildable visits. Deleting explicitly rather than
    # relying on FK cascade, which sqlite does not enforce by default.
    await db.execute(
        sa.update(Image).where(Image.user_id == user.id).where(unprotected).values(visit_id=None)
    )
    delete_visits = sa.delete(Visit).where(Visit.user_id == user.id)
    if protected_visit_ids:
        delete_visits = delete_visits.where(Visit.id.notin_(protected_visit_ids))
    await db.execute(delete_visits)

    points = [
        Point(id=i.id, ts=effective_ts(i), lat=i.lat, lng=i.lng, place_id=i.place_id)
        for i in images
    ]
    for group in group_into_visits(
        points,
        max_gap=timedelta(minutes=settings.visit_max_gap_minutes),
        max_distance_m=settings.visit_max_distance_m,
    ):
        lat, lng = _centroid(group)
        visit = Visit(
            user_id=user.id,
            place_id=dominant_place(p.place_id for p in group),
            started_at=group[0].ts,
            ended_at=group[-1].ts,
            lat=lat,
            lng=lng,
        )
        db.add(visit)
        await db.flush()
        image_ids = [p.id for p in group]
        await db.execute(
            sa.update(Image).where(Image.id.in_(image_ids)).values(visit_id=visit.id)
        )
        await db.execute(
            sa.update(Expense).where(Expense.image_id.in_(image_ids)).values(visit_id=visit.id)
        )

    await _reattach_manual_expenses(db, user)
    await db.commit()


async def _reattach_manual_expenses(db: AsyncSession, user: User) -> None:
    """Rebuilt visits drop their expense links (ON DELETE SET NULL).

    Receipt-backed expenses are re-linked with their image above; expenses
    entered by hand have no image, so they are matched back by time.
    """
    orphans = (
        (
            await db.execute(
                sa.select(Expense).where(
                    Expense.user_id == user.id,
                    Expense.image_id.is_(None),
                    Expense.visit_id.is_(None),
                    Expense.spent_at.isnot(None),
                )
            )
        )
        .scalars()
        .all()
    )
    for expense in orphans:
        expense.visit_id = await db.scalar(
            sa.select(Visit.id)
            .where(
                Visit.user_id == user.id,
                Visit.started_at <= expense.spent_at,
                Visit.ended_at >= expense.spent_at,
            )
            .order_by(Visit.started_at.desc())
            .limit(1)
        )

