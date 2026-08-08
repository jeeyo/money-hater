from datetime import datetime

import sqlalchemy as sa
from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy.orm import selectinload

from app.deps import CurrentUser, DbSession
from app.models import Expense
from app.schemas import (
    CurrencyTotal,
    ExpenseOut,
    ExpenseSummaryOut,
    ExpenseUpdate,
    MerchantTotal,
)
from app.serialize import expense_out

router = APIRouter(prefix="/expenses", tags=["expenses"])

_spent = sa.func.coalesce(Expense.spent_at, Expense.created_at)


def _range_filter(query, user_id: int, date_from: datetime | None, date_to: datetime | None):
    query = query.where(Expense.user_id == user_id)
    if date_from:
        query = query.where(_spent >= date_from)
    if date_to:
        query = query.where(_spent < date_to)
    return query


@router.get("", response_model=list[ExpenseOut])
async def list_expenses(
    user: CurrentUser,
    db: DbSession,
    date_from: datetime | None = Query(default=None),
    date_to: datetime | None = Query(default=None),
    limit: int = Query(default=100, le=500),
    offset: int = 0,
):
    query = _range_filter(
        sa.select(Expense).options(selectinload(Expense.items)), user.id, date_from, date_to
    )
    result = await db.execute(query.order_by(_spent.desc()).limit(limit).offset(offset))
    return [expense_out(expense) for expense in result.scalars()]


@router.get("/summary", response_model=ExpenseSummaryOut)
async def expense_summary(
    user: CurrentUser,
    db: DbSession,
    date_from: datetime | None = Query(default=None),
    date_to: datetime | None = Query(default=None),
):
    totals_q = _range_filter(
        sa.select(Expense.currency, sa.func.sum(Expense.total_minor)).group_by(Expense.currency),
        user.id,
        date_from,
        date_to,
    )
    merchants_q = _range_filter(
        sa.select(
            Expense.merchant,
            Expense.currency,
            sa.func.sum(Expense.total_minor),
            sa.func.count(),
        )
        .where(Expense.merchant.isnot(None))
        .group_by(Expense.merchant, Expense.currency)
        .order_by(sa.func.sum(Expense.total_minor).desc())
        .limit(25),
        user.id,
        date_from,
        date_to,
    )
    totals = [
        CurrencyTotal(currency=row[0], total_minor=row[1] or 0)
        for row in (await db.execute(totals_q)).all()
    ]
    by_merchant = [
        MerchantTotal(merchant=row[0], currency=row[1], total_minor=row[2] or 0, count=row[3])
        for row in (await db.execute(merchants_q)).all()
    ]
    return ExpenseSummaryOut(totals=totals, by_merchant=by_merchant)


@router.patch("/{expense_id}", response_model=ExpenseOut)
async def update_expense(
    expense_id: int, body: ExpenseUpdate, user: CurrentUser, db: DbSession
):
    expense = await db.scalar(
        sa.select(Expense)
        .where(Expense.id == expense_id, Expense.user_id == user.id)
        .options(selectinload(Expense.items))
    )
    if expense is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Expense not found")
    if body.merchant is not None:
        expense.merchant = body.merchant or None
    if body.spent_at is not None:
        expense.spent_at = body.spent_at
    if body.currency is not None:
        expense.currency = body.currency.upper()
    if body.total_minor is not None:
        expense.total_minor = body.total_minor
    if body.note is not None:
        expense.note = body.note or None
    await db.commit()
    return expense_out(expense)
