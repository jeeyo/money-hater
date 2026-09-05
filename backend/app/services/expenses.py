"""Expense creation shared by the receipt pipeline and manual entry."""

from datetime import UTC, datetime
from decimal import Decimal

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Expense, Image, Place, User, Visit
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


async def attach_to_visit(
    db: AsyncSession, expense: Expense, *, reattach: bool = False
) -> None:
    """Link an expense to whichever visit covers the time it was spent.

    `reattach` recomputes an existing link — needed when the time changes,
    otherwise an edited expense would keep pointing at the old stop (or none).
    """
    if expense.spent_at is None:
        return
    if expense.visit_id is not None:
        if not reattach:
            return
        expense.visit_id = None
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


async def resolve_where(
    db: AsyncSession, user: User, place_id: int | None, merchant: str | None
) -> tuple[int | None, str | None]:
    """Normalize the "where" of an expense.

    A picked place wins and also fills the free-text name, so merchant grouping
    keeps working whether or not the user chose from the suggestions.
    """
    if place_id is None:
        # Unlinking keeps the name that was recorded, so history stays readable
        return None, merchant
    place = await db.get(Place, place_id)
    if place is None:
        return None, merchant
    return place.id, merchant or place.name


async def sync_place_from_image(
    db: AsyncSession, image: Image, *, previous_place_id: int | None = None
) -> Expense | None:
    """Carry a photo's place onto the expense that was read off it.

    A receipt photo is the expense's own evidence of where the money went, so
    a photo that only gets a place later — resolved on a second analysis, or
    picked by hand because it had no GPS — hands it to an expense that has
    none. An expense still carrying the photo's previous answer
    (``previous_place_id``) follows a correction too: that place came from
    here in the first place, and leaving it behind would keep the shop next
    door on the money while the photo says otherwise.

    Anything else on the expense is the user's own answer and is left alone.
    """
    if image.place_id is None:
        return None
    expense = await db.scalar(sa.select(Expense).where(Expense.image_id == image.id))
    if expense is None or expense.place_id == image.place_id:
        return None
    if expense.place_id is not None and expense.place_id != previous_place_id:
        return None
    place = await db.get(Place, image.place_id)
    if place is None:
        return None
    expense.place_id = place.id
    # Same rule as `resolve_where`: a place fills the free-text name when
    # there is none, so merchant grouping keeps working either way.
    expense.merchant = expense.merchant or place.name
    return expense


def _same_instant(a: datetime | None, b: datetime | None) -> bool:
    """Compare two stored moments without tripping over a missing offset.

    The columns are `timestamptz`, but sqlite has no zone to give back and
    hands over a naive value where Postgres hands over an aware one. Plain
    `==` between the two is silently False, which would read as "the user
    changed this" and stop a sync that should have run.
    """
    if a is None or b is None:
        return a is None and b is None
    if a.tzinfo is None:
        a = a.replace(tzinfo=UTC)
    if b.tzinfo is None:
        b = b.replace(tzinfo=UTC)
    return a == b


async def sync_time_from_image(
    db: AsyncSession, image: Image, *, previous_taken_at: datetime | None = None
) -> Expense | None:
    """Carry a photo's time onto the expense that was read off it.

    A receipt photo lands on the wrong day often enough — a screenshot whose
    camera never wrote a timestamp is filed under when it was uploaded — and
    the fix is made on the photo, where the date picker is. The expense read
    off it took its time from that same photo, so it has to follow rather than
    leave the user correcting the same day twice, once on each side.

    Only the time this photo gave it moves: an expense with no time at all
    takes the photo's, and one still carrying the photo's previous answer
    (``previous_taken_at``) follows the correction. A time the user set on the
    expense itself, and the date printed on the receipt — which is what the
    money was actually spent at, whenever the photo was taken — are their own
    answers and are left alone.

    The caller reclusters afterwards, which is what re-files a receipt-backed
    expense under the stop its photo now belongs to.
    """
    if image.taken_at is None:
        return None
    expense = await db.scalar(sa.select(Expense).where(Expense.image_id == image.id))
    if expense is None or _same_instant(expense.spent_at, image.taken_at):
        return None
    if expense.spent_at is not None and not _same_instant(expense.spent_at, previous_taken_at):
        return None
    expense.spent_at = image.taken_at
    return expense


async def create_expense(
    db: AsyncSession,
    user: User,
    *,
    total_minor: int,
    currency: str,
    description: str | None = None,
    merchant: str | None = None,
    place_id: int | None = None,
    spent_at: datetime | None = None,
    note: str | None = None,
    tax_minor: int | None = None,
    tip_minor: int | None = None,
    image_id: int | None = None,
    source: str = "manual",
    fx_rate: Decimal | None = None,
) -> Expense:
    place_id, merchant = await resolve_where(db, user, place_id, merchant)
    expense = Expense(
        user_id=user.id,
        image_id=image_id,
        source=source,
        description=description,
        merchant=merchant,
        place_id=place_id,
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
