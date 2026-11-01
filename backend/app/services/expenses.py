"""Expense creation shared by the receipt pipeline and manual entry."""

from datetime import UTC, datetime
from decimal import Decimal

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Expense, Image, Place, User, Visit
from app.services import fx
from app.services.money import convert_minor, minor_factor, to_major, to_minor


async def apply_conversion(
    db: AsyncSession,
    expense: Expense,
    base_currency: str,
    rate: Decimal | None = None,
    rate_is_manual: bool = False,
    rate_source: str | None = None,
) -> None:
    """Fill in base-currency fields, flagging for review when the rate is a guess.

    Same-currency spend needs no confirmation. A foreign amount converted with a
    looked-up rate does — the user may have paid a card rate, or nothing at all
    if the lookup failed.

    ``rate_is_manual`` says the user stood behind the rate, whether they typed
    it or accepted the suggested one; it clears the review flag. The rate's
    ``fx_rate_source`` only says "manual" when a person actually typed it, so
    callers that confirm a looked-up rate pass ``rate_source`` to keep "api".
    """
    expense.base_currency = base_currency
    if expense.currency.upper() == base_currency.upper():
        expense.fx_rate = Decimal(1)
        expense.fx_rate_source = "same"
        expense.base_total_minor = expense.total_minor
        expense.needs_review = False
        return

    if rate is None:
        # The rate for the day it was spent, not the day it was logged
        on = expense.spent_at.date() if expense.spent_at is not None else None
        rate = await fx.get_rate(db, expense.currency, base_currency, on=on)
    expense.fx_rate = rate
    expense.fx_rate_source = rate_source or (
        "manual" if rate_is_manual else ("api" if rate else None)
    )
    expense.base_total_minor = convert_minor(
        expense.total_minor, expense.currency, base_currency, rate
    )
    expense.needs_review = not rate_is_manual


def rescale_for_currency(expense: Expense, old_currency: str) -> None:
    """Keep the same amount when the expense's currency label changes.

    Amounts are integer minor units, so the number means different money in
    different currencies: 10000 is 100.00 baht but 10000 yen. Relabelling an
    expense THB -> JPY without this turns ฿100 into ¥10,000. Re-expressing the
    same major amount in the new unit keeps "100" as "100".
    """
    new_currency = expense.currency
    if minor_factor(old_currency) == minor_factor(new_currency):
        return

    def _rescale(minor: int | None) -> int | None:
        return to_minor(to_major(minor, old_currency), new_currency)

    expense.total_minor = _rescale(expense.total_minor) or 0
    expense.tax_minor = _rescale(expense.tax_minor)
    expense.tip_minor = _rescale(expense.tip_minor)
    for item in expense.items:
        item.unit_price_minor = _rescale(item.unit_price_minor)
        item.amount_minor = _rescale(item.amount_minor) or 0


async def reconvert_all(db: AsyncSession, user: User, base_currency: str) -> None:
    """Re-express every expense in a new base currency.

    The base total is a rollup in one currency; after the user switches it, the
    old figures are in the wrong money but would be summed and labelled as the
    new one. Foreign spend gets the rate for its day and goes back to review,
    since a rate confirmed against the old base says nothing about the new one.
    """
    expenses = (
        (await db.execute(sa.select(Expense).where(Expense.user_id == user.id))).scalars().all()
    )
    for expense in expenses:
        await apply_conversion(db, expense, base_currency)


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


async def sync_time_from_image(db: AsyncSession, image: Image) -> Expense | None:
    """Carry a photo's time onto the expense that was read off it.

    A receipt photo lands on the wrong day often enough — a screenshot whose
    camera never wrote a timestamp is filed under when it was uploaded, or the
    date printed on the receipt itself is misread — and the fix is made on the
    photo, where the date picker is. The expense read off it follows, the same
    way it follows a corrected place, rather than leaving the user to fix the
    same day twice, once on each side.

    Only a time this expense never had of its own moves: ``spent_at_source``
    is "manual" once the user has set the date directly on the expense (see
    `update_expense`), and that answer is left alone from here on — a receipt
    misread once is not grounds to keep overwriting a date someone has since
    typed in by hand.

    The caller reclusters afterwards, which is what re-files a receipt-backed
    expense under the stop its photo now belongs to.
    """
    if image.taken_at is None:
        return None
    expense = await db.scalar(sa.select(Expense).where(Expense.image_id == image.id))
    if expense is None or expense.spent_at_source == "manual":
        return None
    if _same_instant(expense.spent_at, image.taken_at):
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
    spent_at_source: str | None = None,
) -> Expense:
    place_id, merchant = await resolve_where(db, user, place_id, merchant)
    # An expense tied to a photo derives its date from that photo (and follows
    # a later correction to it) unless told otherwise; one with no photo has
    # nothing to derive from, so it is its own answer from the start.
    if spent_at_source is None:
        spent_at_source = "image" if image_id is not None else "manual"
    expense = Expense(
        user_id=user.id,
        image_id=image_id,
        source=source,
        description=description,
        merchant=merchant,
        place_id=place_id,
        spent_at=spent_at,
        spent_at_source=spent_at_source,
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
