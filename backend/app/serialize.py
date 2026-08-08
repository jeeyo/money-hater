"""ORM -> API schema mapping (relationships must be eagerly loaded by callers)."""

from collections import defaultdict

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
    TripDetailOut,
    TripOut,
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
        merchant=expense.merchant,
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
        trip_id=visit.trip_id,
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


def _trip_fields(trip: Trip, base_currency: str) -> dict:
    expenses = [e for visit in trip.visits for e in _visit_expenses(visit)]
    return {
        "id": trip.id,
        "title": trip.title or trip.auto_title,
        "kind": trip.kind,
        "started_at": trip.started_at,
        "ended_at": trip.ended_at,
        "pinned": trip.pinned,
        "visit_count": len(trip.visits),
        "image_count": sum(len(visit.images) for visit in trip.visits),
        "spend": spend_out(expenses, base_currency),
    }


def trip_out(trip: Trip, base_currency: str) -> TripOut:
    return TripOut(**_trip_fields(trip, base_currency))


def trip_detail_out(trip: Trip, base_currency: str) -> TripDetailOut:
    return TripDetailOut(
        **_trip_fields(trip, base_currency),
        visits=[visit_out(v, base_currency) for v in trip.visits],
    )


def timeline_day_out(
    date: str,
    trips: list[Trip],
    unassigned: list[Image],
    expenses: list[Expense],
    base_currency: str,
) -> TimelineDayOut:
    return TimelineDayOut(
        date=date,
        trips=[trip_detail_out(trip, base_currency) for trip in trips],
        unassigned_images=[image_out(image) for image in unassigned],
        spend=spend_out(expenses, base_currency),
    )
