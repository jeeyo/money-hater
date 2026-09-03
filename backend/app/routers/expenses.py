import math
from datetime import datetime
from decimal import Decimal

import sqlalchemy as sa
from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy.orm import selectinload

from app.deps import CurrentUser, DbSession
from app.models import Expense, ExpenseItem, Image, Trip
from app.schemas import (
    ExpenseConfirm,
    ExpenseCreate,
    ExpenseOut,
    ExpensePageOut,
    ExpenseSummaryOut,
    ExpenseUpdate,
    MerchantTotal,
    RateOut,
)
from app.serialize import expense_out, spend_out
from app.services import fx
from app.services.expenses import (
    apply_conversion,
    attach_to_visit,
    create_expense,
    resolve_where,
)
from app.services.money import convert_minor, to_minor

router = APIRouter(prefix="/expenses", tags=["expenses"])

_spent = sa.func.coalesce(Expense.spent_at, Expense.created_at)


def _range_filter(query, user_id: int, date_from: datetime | None, date_to: datetime | None):
    query = query.where(Expense.user_id == user_id)
    if date_from:
        query = query.where(_spent >= date_from)
    if date_to:
        query = query.where(_spent < date_to)
    return query


async def _get_owned(db: DbSession, user_id: int, expense_id: int) -> Expense:
    expense = await db.scalar(
        sa.select(Expense)
        .where(Expense.id == expense_id, Expense.user_id == user_id)
        .options(selectinload(Expense.items), selectinload(Expense.place))
    )
    if expense is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Expense not found")
    return expense


@router.get("", response_model=list[ExpenseOut])
async def list_expenses(
    user: CurrentUser,
    db: DbSession,
    date_from: datetime | None = Query(default=None),
    date_to: datetime | None = Query(default=None),
    needs_review: bool | None = Query(default=None),
    limit: int = Query(default=100, le=500),
    offset: int = 0,
):
    query = _range_filter(
        sa.select(Expense).options(selectinload(Expense.items), selectinload(Expense.place)),
        user.id,
        date_from,
        date_to,
    )
    if needs_review is not None:
        query = query.where(Expense.needs_review.is_(needs_review))
    result = await db.execute(query.order_by(_spent.desc()).limit(limit).offset(offset))
    return [expense_out(expense) for expense in result.scalars()]


@router.get("/grouped", response_model=ExpensePageOut)
async def list_expenses_page(
    user: CurrentUser,
    db: DbSession,
    date_from: datetime | None = Query(default=None),
    date_to: datetime | None = Query(default=None),
    needs_review: bool | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=15, ge=1, le=50),
):
    """The "All expenses" list, most recent first, a page at a time."""

    def _filtered(query):
        query = _range_filter(query, user.id, date_from, date_to)
        if needs_review is not None:
            query = query.where(Expense.needs_review.is_(needs_review))
        return query

    total = await db.scalar(
        sa.select(sa.func.count()).select_from(_filtered(sa.select(Expense.id)).subquery())
    )
    total = total or 0

    query = _filtered(
        sa.select(Expense).options(selectinload(Expense.items), selectinload(Expense.place))
    )
    rows = (
        await db.execute(
            query.order_by(_spent.desc()).limit(page_size).offset((page - 1) * page_size)
        )
    ).scalars()

    return ExpensePageOut(
        expenses=[expense_out(expense) for expense in rows],
        page=page,
        page_size=page_size,
        total=total,
        total_pages=max(1, math.ceil(total / page_size)),
    )


@router.post("", response_model=ExpenseOut, status_code=201)
async def add_expense(body: ExpenseCreate, user: CurrentUser, db: DbSession):
    """Log spending with no receipt photo — cash, a tip, a fare, a split bill.

    Also how a photo the vision model didn't read as a receipt becomes one: pass
    its image_id and the expense is recorded exactly as if the model had read it
    correctly, receipt icon and photo link included.
    """
    currency = body.currency.upper()
    source = "manual"
    image_id = None
    if body.image_id is not None:
        image = await db.get(Image, body.image_id)
        if image is None or image.user_id != user.id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Image not found")
        already = await db.scalar(sa.select(Expense.id).where(Expense.image_id == image.id))
        if already is not None:
            raise HTTPException(status.HTTP_409_CONFLICT, "This photo already has an expense")
        image_id = image.id
        source = "receipt"
    expense = await create_expense(
        db,
        user,
        total_minor=to_minor(body.total, currency) or 0,
        currency=currency,
        description=body.description,
        merchant=body.merchant,
        place_id=body.place_id,
        spent_at=body.spent_at or datetime.now(tz=None).astimezone(),
        note=body.note,
        tax_minor=to_minor(body.tax, currency),
        tip_minor=to_minor(body.tip, currency),
        image_id=image_id,
        source=source,
        fx_rate=body.fx_rate,
    )
    for item in body.items:
        db.add(
            ExpenseItem(
                expense_id=expense.id,
                name=item.name,
                qty=item.qty,
                amount_minor=to_minor(item.amount, currency) or 0,
            )
        )
    await db.commit()
    return expense_out(await _get_owned(db, user.id, expense.id))


@router.get("/summary", response_model=ExpenseSummaryOut)
async def expense_summary(
    user: CurrentUser,
    db: DbSession,
    date_from: datetime | None = Query(default=None),
    date_to: datetime | None = Query(default=None),
):
    expenses = (
        (await db.execute(_range_filter(sa.select(Expense), user.id, date_from, date_to)))
        .scalars()
        .all()
    )
    merchants_q = _range_filter(
        sa.select(
            Expense.merchant,
            sa.func.sum(sa.func.coalesce(Expense.base_total_minor, 0)),
            sa.func.count(),
        )
        .where(Expense.merchant.isnot(None))
        .group_by(Expense.merchant)
        .order_by(sa.func.sum(sa.func.coalesce(Expense.base_total_minor, 0)).desc())
        .limit(25),
        user.id,
        date_from,
        date_to,
    )
    by_merchant = [
        MerchantTotal(
            merchant=row[0],
            base_currency=user.preferred_currency,
            base_total_minor=row[1] or 0,
            count=row[2],
        )
        for row in (await db.execute(merchants_q)).all()
    ]
    return ExpenseSummaryOut(
        spend=spend_out(list(expenses), user.preferred_currency),
        by_merchant=by_merchant,
        needs_review_count=sum(1 for e in expenses if e.needs_review),
    )


@router.get("/rate", response_model=RateOut)
async def quote_rate(
    user: CurrentUser,
    db: DbSession,
    from_currency: str = Query(min_length=3, max_length=3),
    amount: Decimal | None = Query(default=None, gt=0),
):
    """Today's rate into the user's base currency, for prefilling the UI."""
    to_currency = user.preferred_currency.upper()
    rate = await fx.get_rate(db, from_currency, to_currency)
    await db.commit()
    converted = None
    if rate is not None and amount is not None:
        converted = convert_minor(
            to_minor(amount, from_currency), from_currency, to_currency, rate
        )
    return RateOut(
        from_currency=from_currency.upper(),
        to_currency=to_currency,
        rate=float(rate) if rate is not None else None,
        converted_minor=converted,
    )


@router.post("/{expense_id}/confirm", response_model=ExpenseOut)
async def confirm_expense(
    expense_id: int, body: ExpenseConfirm, user: CurrentUser, db: DbSession
):
    """Accept the suggested conversion, or override the rate the user actually got."""
    expense = await _get_owned(db, user.id, expense_id)
    rate = body.fx_rate if body.fx_rate is not None else expense.fx_rate
    if rate is None:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "No exchange rate available — provide fx_rate",
        )
    await apply_conversion(
        db, expense, user.preferred_currency, rate=rate, rate_is_manual=True
    )
    await db.commit()
    return expense_out(expense)


@router.patch("/{expense_id}", response_model=ExpenseOut)
async def update_expense(
    expense_id: int, body: ExpenseUpdate, user: CurrentUser, db: DbSession
):
    expense = await _get_owned(db, user.id, expense_id)
    # `null` means "clear this" only when the key was actually sent; an absent
    # key leaves the field alone.
    sent = body.model_fields_set
    if body.description is not None or "description" in sent:
        expense.description = body.description or None
    if "place_id" in sent:
        where_name = body.merchant if body.merchant is not None else expense.merchant
        expense.place_id, expense.merchant = await resolve_where(
            db, user, body.place_id, where_name
        )
    elif body.merchant is not None:
        expense.merchant = body.merchant or None
    if body.spent_at is not None:
        expense.spent_at = body.spent_at
        await attach_to_visit(db, expense, reattach=True)
    currency_changed = body.currency is not None and body.currency.upper() != expense.currency
    if body.currency is not None:
        expense.currency = body.currency.upper()
    if body.total is not None:
        expense.total_minor = to_minor(body.total, expense.currency) or 0
    if body.note is not None or "note" in sent:
        expense.note = body.note or None
    # Any change to amount, currency or rate re-derives the base-currency total.
    # A new currency invalidates the stored rate, so look a fresh one up unless
    # the user supplied theirs.
    if currency_changed or body.total is not None or body.fx_rate is not None:
        if body.fx_rate is not None:
            rate, manual = body.fx_rate, True
        elif currency_changed:
            rate, manual = None, False
        else:
            rate, manual = expense.fx_rate, expense.fx_rate_source == "manual"
        await apply_conversion(
            db, expense, user.preferred_currency, rate=rate, rate_is_manual=manual
        )
    await db.commit()
    if "place_id" in sent:
        # The session keeps objects unexpired on commit, so a changed link
        # would otherwise serialize from the stale relationship
        await db.refresh(expense, attribute_names=["place"])
    return expense_out(expense)


@router.delete("/{expense_id}", status_code=204)
async def delete_expense(expense_id: int, user: CurrentUser, db: DbSession):
    expense = await _get_owned(db, user.id, expense_id)
    # Trips are defined by their bounding expenses, so deleting one would leave
    # the trip without an edge. Say so instead of failing on the constraint.
    bounding = await db.scalar(
        sa.select(Trip).where(
            Trip.user_id == user.id,
            sa.or_(Trip.start_expense_id == expense.id, Trip.end_expense_id == expense.id),
        )
    )
    if bounding is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"This expense marks the start or end of “{bounding.title}” — "
            "change that trip's bounds first",
        )
    await db.delete(expense)
    await db.commit()
