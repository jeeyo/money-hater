"""ORM -> API schema mapping (relationships must be eagerly loaded by callers)."""

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
    TripDayOut,
    TripDetailOut,
    TripOut,
    TripRef,
    UserOut,
    VisitOut,
)


def user_out(user) -> UserOut:
    return UserOut(
        id=user.id,
        email=user.email,
        preferred_currency=user.preferred_currency,
        home_lat=user.home_lat,
        home_lng=user.home_lng,
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
        taken_at_source=image.taken_at_source,
        lat=image.lat,
        lng=image.lng,
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


def visit_out(visit: Visit, base_currency: str) -> VisitOut:
    return VisitOut(
        id=visit.id,
        label=visit_label(visit),
        place=place_out(visit.place),
        started_at=visit.started_at,
        ended_at=visit.ended_at,
        lat=visit.lat,
        lng=visit.lng,
        pinned=visit.pinned,
        images=[image_out(image) for image in visit.images],
        spend=spend_out(_visit_expenses(visit), base_currency),
    )


def day_key(moment: datetime, tz_offset_minutes: int) -> str:
    return (moment + timedelta(minutes=tz_offset_minutes)).date().isoformat()


def group_by_day(
    visits: list[Visit], base_currency: str, tz_offset_minutes: int
) -> list[TripDayOut]:
    days: dict[str, list[Visit]] = defaultdict(list)
    for visit in visits:
        days[day_key(visit.started_at, tz_offset_minutes)].append(visit)
    return [
        TripDayOut(
            date=date,
            visits=[visit_out(v, base_currency) for v in day_visits],
            spend=spend_out(
                [e for v in day_visits for e in _visit_expenses(v)], base_currency
            ),
        )
        for date, day_visits in sorted(days.items())
    ]


def trip_ref(trip: Trip | None) -> TripRef | None:
    return TripRef(id=trip.id, title=trip.title) if trip else None


def _trip_fields(
    trip: Trip,
    window,
    visits: list[Visit],
    expenses: list[Expense],
    base_currency: str,
    tz_offset_minutes: int,
) -> dict:
    first = day_key(window.started_at, tz_offset_minutes)
    last = day_key(window.ended_at, tz_offset_minutes)
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


def trip_out(
    trip: Trip, window, visits, expenses, base_currency: str, tz_offset_minutes: int = 0
) -> TripOut:
    return TripOut(
        **_trip_fields(trip, window, visits, expenses, base_currency, tz_offset_minutes)
    )


def trip_detail_out(
    trip: Trip, window, visits, expenses, base_currency: str, tz_offset_minutes: int = 0
) -> TripDetailOut:
    return TripDetailOut(
        **_trip_fields(trip, window, visits, expenses, base_currency, tz_offset_minutes),
        days=group_by_day(visits, base_currency, tz_offset_minutes),
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
        spend=spend_out(expenses, base_currency),
    )
