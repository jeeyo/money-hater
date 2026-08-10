"""Itinerary reconstruction: images -> visits.

Deterministic spatiotemporal clustering, re-run after every analyzed image:
consecutive images join the same *visit* while the time gap stays under
VISIT_MAX_GAP and the GPS distance under VISIT_MAX_DISTANCE.

A photo does not need a fix of its own to take part. Its place, if the user
named one, stands in for the coordinates it never had, and a photo with
neither — a receipt screenshot, say — is attached afterwards to the stop
nearest in time. Such a photo joins a stop without shaping it: the window,
the centroid and the name are decided by the photos that know where they were.

A place the *user* set outranks the thresholds entirely. Coordinates are
evidence and a reverse-geocoded place is a guess, but a place someone picked
by hand is an answer: two photos placed at different addresses are two stops
however close together they were taken, and two photos placed at the same
address are one stop however far apart their fixes drift. Two receipts from
neighbouring shops on the same street used to land in one stop under the wrong
shop's name — 300m apart is well inside VISIT_MAX_DISTANCE, so nothing but the
places themselves could tell them apart.

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
from sqlalchemy.orm import selectinload

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
    # The place came from the user, not from reverse geocoding. Only then is it
    # allowed to decide the grouping; see `told_place`.
    place_pinned: bool = False


def told_place(point: Point) -> int | None:
    """The place the user said this photo was of, if they said one.

    A reverse-geocoded place is deliberately not one. It is the nearest match
    to a fix, which indoors or on a dense street is regularly the shop next
    door, and letting a guess like that split stops would cut an afternoon of
    walking into a stop per photo.
    """
    return point.place_id if point.place_pinned else None


def group_into_visits(
    points: list[Point], max_gap: timedelta, max_distance_m: float
) -> list[list[Point]]:
    """Group time-sorted points into visit clusters (pure, unit-tested)."""
    groups: list[list[Point]] = []
    last_gps: Point | None = None
    named: int | None = None  # the place the user gave the group being built
    for point in sorted(points, key=lambda p: p.ts):
        told = told_place(point)
        if not groups:
            starts_new = True
        else:
            too_late = point.ts - groups[-1][-1].ts > max_gap
            if told is not None and named is not None:
                # Both photos have been answered for, so the answers decide and
                # the coordinates do not get a vote either way.
                starts_new = told != named or too_late
            else:
                too_far = (
                    point.lat is not None
                    and last_gps is not None
                    and haversine_m(point.lat, point.lng, last_gps.lat, last_gps.lng)
                    > max_distance_m
                )
                starts_new = too_late or too_far
        if starts_new:
            groups.append([point])
            last_gps = None
            named = told
        else:
            groups[-1].append(point)
            # A stop with no answer yet takes the first one it is given
            named = named if named is not None else told
        if point.lat is not None:
            last_gps = point
    return groups


def _centroid(points: list[Point]) -> tuple[float | None, float | None]:
    gps = [(p.lat, p.lng) for p in points if p.lat is not None]
    if not gps:
        return None, None
    return sum(p[0] for p in gps) / len(gps), sum(p[1] for p in gps) / len(gps)


def dominant_place(places: Iterable[tuple[int | None, bool]]) -> int | None:
    """The place a group of photos is mostly of — what names the stop.

    Takes (place_id, pinned) pairs. One place the user picked outranks any
    number of reverse-geocoded ones: they answered this exact question, and
    what they were answering was the guess now being outvoted. Ties go to the
    earliest photo, so the name never depends on the order rows came back in.
    """
    counts: dict[int, int] = {}
    picked: dict[int, int] = {}
    for place_id, pinned in places:
        if place_id is None:
            continue
        counts[place_id] = counts.get(place_id, 0) + 1
        if pinned:
            picked[place_id] = picked.get(place_id, 0) + 1
    votes = picked or counts
    return max(votes, key=votes.get) if votes else None  # type: ignore[arg-type]


def _aware(ts: datetime) -> datetime:
    # sqlite returns naive datetimes; normalize so comparisons never mix awareness
    return ts if ts.tzinfo else ts.replace(tzinfo=UTC)


def effective_ts(image: Image) -> datetime:
    return _aware(image.taken_at or image.uploaded_at)


def effective_coords(image: Image) -> tuple[float | None, float | None]:
    """Where a photo was, whether or not its camera knew.

    A screenshot has no fix, but a place the user picked for it is a real
    address with real coordinates — enough to make it a stop and a map pin.
    Its own GPS still wins where it has one.
    """
    if image.lat is not None and image.lng is not None:
        return image.lat, image.lng
    if image.place is not None:
        return image.place.lat, image.place.lng
    return None, None


def nearest_visit_id(ts: datetime, visits: Iterable[Visit], max_gap: timedelta) -> int | None:
    """The stop a photo with no location of its own most likely belongs to.

    Distance is measured to the stop's *window*: zero while the photo was taken
    during it, and how far outside it otherwise. The nearest stop wins, and only
    if it is within the same gap that would have kept two photos together —
    beyond that the photo is left unplaced rather than guessed at.
    """
    when = _aware(ts)
    best: tuple[timedelta, datetime, int] | None = None
    for visit in visits:
        started, ended = _aware(visit.started_at), _aware(visit.ended_at)
        distance = max(started - when, when - ended, timedelta(0))
        if distance > max_gap:
            continue
        # Ties go to the stop that started first, so the answer never depends
        # on the order the rows came back in.
        candidate = (distance, started, visit.id)
        if best is None or candidate < best:
            best = candidate
    return best[2] if best is not None else None


async def refresh_visit_place(db: AsyncSession, visit_id: int) -> None:
    """Re-derive one stop's place from the places of the photos in it.

    The narrow counterpart to recluster_user, for a place edit that cannot move
    any photo between stops — ask `place_edit_regroups` first. Rebuilding every
    stop would only hand out fresh ids for stops that did not change, and a new
    id reaches the UI as a different card. Pinned stops are the user's own edit
    and stay untouched.
    """
    visit = await db.get(Visit, visit_id)
    if visit is None or visit.pinned:
        return
    places = await db.execute(
        sa.select(Image.place_id, Image.place_pinned)
        .where(Image.visit_id == visit_id)
        .order_by(Image.taken_at, Image.id)
    )
    visit.place_id = dominant_place(places.all())  # type: ignore[arg-type]
    await db.commit()


async def place_edit_regroups(db: AsyncSession, image: Image) -> bool:
    """Can naming this photo's place move photos between stops?

    A place the user picked decides grouping, so an edit can now split a stop
    in two — the receipt from the shop next door leaving the meal it was filed
    under — or merge two back together once both are placed at the same address.
    Either way the stops have to be rebuilt.

    It is only when nothing near this photo has been placed by hand that the
    shape of the stops is settled and the cheap rename will do. Answering
    conservatively costs a rebuild; answering wrongly leaves a photo in a stop
    the user has just said it does not belong to.
    """
    if image.lat is None or image.lng is None or image.visit_id is None:
        # No fix of its own: a place is the only location it will ever have, so
        # naming one lets it form or join a stop, and taking one away unmakes it.
        return True
    other_answers = await db.scalar(
        sa.select(sa.func.count())
        .select_from(Image)
        .where(
            Image.user_id == image.user_id,
            Image.id != image.id,
            Image.place_pinned.is_(True),
        )
    )
    return bool(other_answers)


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

    # Everything that knows where it was, by its own fix or by the place the
    # user gave it. Photos with neither are attached afterwards, by time, so
    # they cannot bridge two stops or stretch one to reach them.
    images = (
        (
            await db.execute(
                sa.select(Image)
                .where(
                    Image.user_id == user.id,
                    Image.status != "pending",
                    sa.or_(Image.lat.isnot(None), Image.place_id.isnot(None)),
                    unprotected,
                )
                .options(selectinload(Image.place))
                # A caller that just changed a photo's place still holds the
                # row with the place it had before, and the stale relationship
                # would cost the photo the coordinates it was given.
                .execution_options(populate_existing=True)
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

    points: list[Point] = []
    for image in images:
        lat, lng = effective_coords(image)
        points.append(
            Point(
                id=image.id,
                ts=effective_ts(image),
                lat=lat,
                lng=lng,
                place_id=image.place_id,
                place_pinned=image.place_pinned,
            )
        )
    for group in group_into_visits(
        points,
        max_gap=timedelta(minutes=settings.visit_max_gap_minutes),
        max_distance_m=settings.visit_max_distance_m,
    ):
        lat, lng = _centroid(group)
        visit = Visit(
            user_id=user.id,
            place_id=dominant_place((p.place_id, p.place_pinned) for p in group),
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

    await _attach_unlocated(db, user, unprotected)
    await _reattach_manual_expenses(db, user)
    await db.commit()


async def _attach_unlocated(
    db: AsyncSession, user: User, unprotected: sa.ColumnElement[bool]
) -> None:
    """Place the photos that know neither where they were nor of what.

    A receipt screenshot has no fix and, until the user says otherwise, no
    place — but it was taken around the time of the stop it belongs to, and
    that is enough to file it there. It is attached once the stops are built,
    so it can only join one, never move or reshape one.
    """
    images = (
        (
            await db.execute(
                sa.select(Image).where(
                    Image.user_id == user.id,
                    Image.status != "pending",
                    Image.lat.is_(None),
                    Image.place_id.is_(None),
                    unprotected,
                )
            )
        )
        .scalars()
        .all()
    )
    if not images:
        return

    # Pinned stops are real stops and valid homes for a photo; refresh_visit_place
    # leaves them alone, so joining one cannot rename it.
    visits = (await db.execute(sa.select(Visit).where(Visit.user_id == user.id))).scalars().all()
    max_gap = timedelta(minutes=settings.visit_max_gap_minutes)
    for image in images:
        image.visit_id = nearest_visit_id(effective_ts(image), visits, max_gap)
        if image.visit_id is None:
            continue
        # A receipt's expense belongs to the same stop as the photo of it
        await db.execute(
            sa.update(Expense).where(Expense.image_id == image.id).values(visit_id=image.visit_id)
        )


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

