"""Expense creation shared by the receipt pipeline and manual entry."""

from datetime import datetime
from decimal import Decimal

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Expense, User, Visit
from app.services import fx
from app.services.money import convert_minor


async def apply_conversion(
    db: AsyncSession,
    expense: Expense,
    base_currency: str,
    rate: Decimal | None = None,
    rate_is_manual: bool = False,
) -> None:
    """Fill in base-currency fields, flagging for review when the rate is a guess.

    Same-currency spend needs no confirmation. A foreign amount converted with a
    looked-up rate does — the user may have paid a card rate, or nothing at all
    if the lookup failed.
    """
    expense.base_currency = base_currency
    if expense.currency.upper() == base_currency.upper():
        expense.fx_rate = Decimal(1)
        expense.fx_rate_source = "same"
        expense.base_total_minor = expense.total_minor
        expense.needs_review = False
        return

    if rate is None:
        rate = await fx.get_rate(db, expense.currency, base_currency)
    expense.fx_rate = rate
    expense.fx_rate_source = "manual" if rate_is_manual else ("api" if rate else None)
    expense.base_total_minor = convert_minor(
        expense.total_minor, expense.currency, base_currency, rate
    )
    expense.needs_review = not rate_is_manual


async def attach_to_visit(db: AsyncSession, expense: Expense) -> None:
    """Link a manual expense to whichever visit covers the time it was spent."""
    if expense.spent_at is None or expense.visit_id is not None:
        return
    visit_id = await db.scalar(
        sa.select(Visit.id)
        .where(
            Visit.user_id == expense.user_id,
            Visit.started_at <= expense.spent_at,
            Visit.ended_at >= expense.spent_at,
        )
        .order_by(Visit.started_at.desc())
        .limit(1)
    )
    expense.visit_id = visit_id


async def create_expense(
    db: AsyncSession,
    user: User,
    *,
    total_minor: int,
    currency: str,
    merchant: str | None = None,
    spent_at: datetime | None = None,
    note: str | None = None,
    tax_minor: int | None = None,
    tip_minor: int | None = None,
    image_id: int | None = None,
    source: str = "manual",
    fx_rate: Decimal | None = None,
) -> Expense:
    expense = Expense(
        user_id=user.id,
        image_id=image_id,
        source=source,
        merchant=merchant,
        spent_at=spent_at,
        currency=currency.upper(),
        total_minor=total_minor,
        tax_minor=tax_minor,
        tip_minor=tip_minor,
        note=note,
    )
    db.add(expense)
    await apply_conversion(
        db,
        expense,
        user.preferred_currency,
        rate=fx_rate,
        rate_is_manual=fx_rate is not None,
    )
    await db.flush()
    await attach_to_visit(db, expense)
    return expense
