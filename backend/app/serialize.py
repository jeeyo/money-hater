"""ORM -> API schema mapping (relationships must be eagerly loaded by callers)."""

import math
from collections import defaultdict
from datetime import date, datetime, timedelta

from app.models import Expense, Image, Place, Trip, Visit
from app.schemas import (
    AnalysisOut,
    CurrencyTotal,
    ExpenseItemOut,
    ExpenseOut,
    ImageOut,
    PlaceOut,
    SpendOut,
    TimelineDayOut,
    TimelineDaySummaryOut,
    TimelineRangeOut,
    TripDayOut,
    TripDetailOut,
    TripOut,
    TripRef,
    UserOut,
    VisitOut,
)


def coord(value: float | None) -> float | None:
    """A coordinate, or None if it is not a number JSON can carry.

    EXIF parsing rejects NaN now, but rows written before it did still hold
    one, and a single NaN would fail the encoding of a whole day's timeline
    rather than of the one photo it came from.
    """
    return value if value is not None and math.isfinite(value) else None


def user_out(user) -> UserOut:
    return UserOut(
        id=user.id,
        email=user.email,
        preferred_currency=user.preferred_currency,
        home_lat=coord(user.home_lat),
        home_lng=coord(user.home_lng),
        home_label=user.home_label,
    )


def place_out(place: Place | None) -> PlaceOut | None:
    if place is None:
        return None
    return PlaceOut(
        id=place.id,
        name=place.name,
        formatted_address=place.formatted_address,
        lat=place.lat,
        lng=place.lng,
        types=place.types,
    )


def image_out(image: Image) -> ImageOut:
    analysis = image.analysis
    return ImageOut(
        id=image.id,
        mime=image.mime,
        taken_at=image.taken_at,
        exif_taken_at=image.exif_taken_at,
        taken_at_source=image.taken_at_source,
        lat=coord(image.lat),
        lng=coord(image.lng),
        status=image.status,
        error=image.error,
        uploaded_at=image.uploaded_at,
        visit_id=image.visit_id,
        place=place_out(image.place),
        analysis=AnalysisOut(kind=analysis.kind, caption=analysis.caption, labels=analysis.labels)
        if analysis
        else None,
        original_url=f"/api/images/{image.id}/file",
        thumb_url=f"/api/images/{image.id}/thumb" if image.thumb_path else None,
        has_expense=image.expense is not None,
    )


def expense_out(expense: Expense) -> ExpenseOut:
    return ExpenseOut(
        id=expense.id,
        image_id=expense.image_id,
        visit_id=expense.visit_id,
        source=expense.source,
        description=expense.description,
        merchant=expense.merchant,
        place=place_out(expense.place),
        spent_at=expense.spent_at,
        currency=expense.currency,
        total_minor=expense.total_minor,
        tax_minor=expense.tax_minor,
        tip_minor=expense.tip_minor,
        base_currency=expense.base_currency,
        base_total_minor=expense.base_total_minor,
        fx_rate=float(expense.fx_rate) if expense.fx_rate is not None else None,
        fx_rate_source=expense.fx_rate_source,
        needs_review=expense.needs_review,
        note=expense.note,
        items=[
            ExpenseItemOut(
                id=item.id,
                name=item.name,
                qty=item.qty,
                unit_price_minor=item.unit_price_minor,
                amount_minor=item.amount_minor,
            )
            for item in expense.items
        ],
    )


def spend_out(expenses: list[Expense], base_currency: str) -> SpendOut:
    by_currency: dict[str, int] = defaultdict(int)
    base_total = 0
    unconfirmed = 0
    for expense in expenses:
        by_currency[expense.currency] += expense.total_minor
        base_total += expense.base_total_minor or 0
        if expense.needs_review or expense.base_total_minor is None:
            unconfirmed += 1
    return SpendOut(
        base_currency=base_currency,
        base_total_minor=base_total,
        by_currency=[
            CurrencyTotal(currency=currency, total_minor=total)
            for currency, total in sorted(by_currency.items())
        ],
        unconfirmed_count=unconfirmed,
    )


def visit_label(visit: Visit) -> str:
    if visit.label_override:
        return visit.label_override
    if visit.place is not None:
        return visit.place.name
    return "Unknown stop"


def _visit_expenses(visit: Visit) -> list[Expense]:
    """Expenses attached to the visit — from receipts and from manual entry alike."""
    return list(visit.expenses)


def expense_moment(expense: Expense) -> datetime:
    """When an expense counts as having happened — when spent, else when logged."""
    return expense.spent_at or expense.created_at


def in_time_order(expenses: list[Expense]) -> list[Expense]:
    return sorted(expenses, key=expense_moment)


def shown_as_text(expenses: list[Expense]) -> list[Expense]:
    """The expenses that need a row of their own, in time order.

    An expense with a receipt photo is already on screen as that photo — in
    its stop's card, or under "not yet placed" — so it is left to it. One
    without a photo has nothing standing for it, and a total in a banner is
    not the same as being able to see what the money went on. Those are the
    ones a card or a line is drawn for.
    """
    return in_time_order([expense for expense in expenses if expense.image_id is None])


def loose(expenses: list[Expense]) -> list[Expense]:
    """Photoless expenses that no stop claimed either — nothing shows these."""
    return [expense for expense in shown_as_text(expenses) if expense.visit_id is None]


def visit_out(visit: Visit, base_currency: str) -> VisitOut:
    return VisitOut(
        id=visit.id,
        label=visit_label(visit),
        place=place_out(visit.place),
        started_at=visit.started_at,
        ended_at=visit.ended_at,
        lat=coord(visit.lat),
        lng=coord(visit.lng),
        pinned=visit.pinned,
        images=[image_out(image) for image in visit.images],
        expenses=[expense_out(expense) for expense in shown_as_text(_visit_expenses(visit))],
        spend=spend_out(_visit_expenses(visit), base_currency),
    )


def day_key(moment: datetime) -> str:
    """The day a stored moment falls on — read straight off its own clock.

    Stored moments are local wall clocks (`app.services.localtime`), so the
    date is already the local date. Adding the viewer's offset moved a whole
    evening onto tomorrow.
    """
    return moment.date().isoformat()


def group_by_day(
    visits: list[Visit], expenses: list[Expense], base_currency: str
) -> list[TripDayOut]:
    """The trip's days, in order — one per day that has anything on it.

    A day is not made only by photographs: a day you spent cash on and took no
    picture of is still a day of the trip, so the loose expenses open a day of
    their own where no stop did.
    """
    day_visits: dict[str, list[Visit]] = defaultdict(list)
    for visit in visits:
        day_visits[day_key(visit.started_at)].append(visit)

    day_loose: dict[str, list[Expense]] = defaultdict(list)
    for expense in loose(expenses):
        day_loose[day_key(expense_moment(expense))].append(expense)

    return [
        TripDayOut(
            date=key,
            visits=[visit_out(v, base_currency) for v in day_visits[key]],
            expenses=[expense_out(e) for e in day_loose[key]],
            spend=spend_out(
                [e for v in day_visits[key] for e in _visit_expenses(v)] + day_loose[key],
                base_currency,
            ),
        )
        for key in sorted(day_visits.keys() | day_loose.keys())
    ]


def trip_ref(trip: Trip | None) -> TripRef | None:
    return (
        TripRef(id=trip.id, title=trip.title, end_expense_id=trip.end_expense_id) if trip else None
    )


def _trip_fields(
    trip: Trip,
    window,
    visits: list[Visit],
    expenses: list[Expense],
    base_currency: str,
) -> dict:
    first = day_key(window.started_at)
    last = day_key(window.ended_at)
    return {
        "id": trip.id,
        "title": trip.title,
        "note": trip.note,
        "start_expense_id": trip.start_expense_id,
        "end_expense_id": trip.end_expense_id,
        "started_at": window.started_at,
        "ended_at": window.ended_at,
        "day_count": (date.fromisoformat(last) - date.fromisoformat(first)).days + 1,
        "visit_count": len(visits),
        "image_count": sum(len(visit.images) for visit in visits),
        "spend": spend_out(expenses, base_currency),
    }


def trip_out(trip: Trip, window, visits, expenses, base_currency: str) -> TripOut:
    return TripOut(**_trip_fields(trip, window, visits, expenses, base_currency))


def trip_detail_out(trip: Trip, window, visits, expenses, base_currency: str) -> TripDetailOut:
    return TripDetailOut(
        **_trip_fields(trip, window, visits, expenses, base_currency),
        days=group_by_day(visits, expenses, base_currency),
        expenses=[expense_out(expense) for expense in expenses],
    )


def timeline_day_out(
    date_str: str,
    trip: Trip | None,
    visits: list[Visit],
    unassigned: list[Image],
    expenses: list[Expense],
    base_currency: str,
) -> TimelineDayOut:
    return TimelineDayOut(
        date=date_str,
        trip=trip_ref(trip),
        visits=[visit_out(visit, base_currency) for visit in visits],
        unassigned_images=[image_out(image) for image in unassigned],
        expenses=[expense_out(expense) for expense in loose(expenses)],
        spend=spend_out(expenses, base_currency),
    )


# How many frames a day carries when seen from a week or a month away. Enough to
# recognise the day by, few enough that a month is still a small response.
THUMBS_PER_DAY = 6


def image_moment(image: Image) -> datetime:
    """When a photo counts as having happened — when it was taken, else uploaded."""
    return image.taken_at or image.uploaded_at


def _days_touched(visit: Visit) -> list[str]:
    """Every local day the visit is part of — a stop over midnight is on both."""
    first = date.fromisoformat(day_key(visit.started_at))
    last = date.fromisoformat(day_key(visit.ended_at))
    return [
        (first + timedelta(days=offset)).isoformat() for offset in range((last - first).days + 1)
    ]


def timeline_range_out(
    span: str,
    days: list[date],
    trips_by_day: dict[str, Trip],
    visits: list[Visit],
    images: list[Image],
    expenses: list[Expense],
    base_currency: str,
) -> TimelineRangeOut:
    """A week or a month, one summary per day — empty days included.

    Callers pass the whole span's rows once; the grouping happens here so the
    router stays three queries and a date range. Empty days are kept because a
    calendar that skips them cannot be laid out.
    """
    day_visits: dict[str, list[Visit]] = defaultdict(list)
    for visit in visits:  # already ordered by start, so each day stays ordered
        for key in _days_touched(visit):
            day_visits[key].append(visit)

    day_images: dict[str, list[Image]] = defaultdict(list)
    for image in images:
        day_images[day_key(image_moment(image))].append(image)

    # A day's total has to match the visits shown on it, so a visit's
    # expenses are filed under every day the visit touches — not just the
    # day the expense's own timestamp claims, which a misread receipt can
    # put somewhere else entirely. Keyed by id per day to dedupe the expense
    # against itself when it also lands there by its own timestamp.
    day_expenses: dict[str, dict[int, Expense]] = defaultdict(dict)
    for expense in expenses:
        key = day_key(expense_moment(expense))
        day_expenses[key][expense.id] = expense
    for visit in visits:
        for key in _days_touched(visit):
            for expense in _visit_expenses(visit):
                day_expenses[key][expense.id] = expense

    summaries = []
    for day in days:
        key = day.isoformat()
        of_day = day_visits[key]
        photos = day_images[key]
        summaries.append(
            TimelineDaySummaryOut(
                date=key,
                trip=trip_ref(trips_by_day.get(key)),
                stops=[visit_label(visit) for visit in of_day],
                visit_count=len(of_day),
                image_count=len(photos),
                expense_count=len(day_expenses[key]),
                thumbs=[image_out(image) for image in photos[:THUMBS_PER_DAY]],
                spend=spend_out(list(day_expenses[key].values()), base_currency),
            )
        )

    # Deduplicated in day order: one chip per trip the span runs through
    trips = {trip.id: trip for trip in trips_by_day.values()}
    all_expenses = {expense.id: expense for expense in expenses}
    for visit in visits:
        for expense in _visit_expenses(visit):
            all_expenses[expense.id] = expense
    return TimelineRangeOut(
        span=span,
        start=days[0].isoformat(),
        end=days[-1].isoformat(),
        days=summaries,
        trips=[trip_ref(trip) for trip in trips.values()],
        spend=spend_out(list(all_expenses.values()), base_currency),
    )
