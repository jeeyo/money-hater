from datetime import UTC, datetime

import sqlalchemy as sa
from fastapi import APIRouter, HTTPException, status
from sqlalchemy.orm import selectinload

from app.deps import CurrentUser, DbSession
from app.models import Subscription
from app.schemas import SubscriptionCreate, SubscriptionOut, SubscriptionUpdate
from app.serialize import subscription_out
from app.services.expenses import resolve_where
from app.services.money import to_minor
from app.services.subscriptions import next_occurrence

router = APIRouter(prefix="/subscriptions", tags=["subscriptions"])


async def _get_owned(db: DbSession, user_id: int, subscription_id: int) -> Subscription:
    subscription = await db.scalar(
        sa.select(Subscription)
        .where(
            Subscription.id == subscription_id,
            Subscription.user_id == user_id,
            Subscription.deleted_at.is_(None),
        )
        .options(selectinload(Subscription.place))
    )
    if subscription is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Subscription not found")
    return subscription


@router.get("", response_model=list[SubscriptionOut])
async def list_subscriptions(user: CurrentUser, db: DbSession):
    result = await db.execute(
        sa.select(Subscription)
        .where(Subscription.user_id == user.id, Subscription.deleted_at.is_(None))
        .options(selectinload(Subscription.place))
        .order_by(Subscription.next_run_on)
    )
    return [subscription_out(s) for s in result.scalars()]


@router.post("", response_model=SubscriptionOut, status_code=201)
async def create_subscription(body: SubscriptionCreate, user: CurrentUser, db: DbSession):
    if body.interval == "yearly" and body.month is None:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, "A yearly subscription needs a month"
        )
    currency = body.currency.upper()
    place_id, merchant = await resolve_where(db, user, body.place_id, body.merchant)
    start = body.start_date or datetime.now(UTC).date()
    subscription = Subscription(
        user_id=user.id,
        description=body.description,
        merchant=merchant,
        place_id=place_id,
        currency=currency,
        amount_minor=to_minor(body.amount, currency) or 0,
        interval=body.interval,
        day_of_month=body.day_of_month,
        month=body.month if body.interval == "yearly" else None,
        next_run_on=next_occurrence(
            body.interval, body.day_of_month, body.month, on_or_after=start
        ),
        note=body.note,
    )
    db.add(subscription)
    await db.commit()
    return subscription_out(await _get_owned(db, user.id, subscription.id))


@router.patch("/{subscription_id}", response_model=SubscriptionOut)
async def update_subscription(
    subscription_id: int, body: SubscriptionUpdate, user: CurrentUser, db: DbSession
):
    """Changes affect future expenses only — expenses already created keep the
    fields they were given at the time (see Subscription in models.py)."""
    subscription = await _get_owned(db, user.id, subscription_id)
    sent = body.model_fields_set

    interval = body.interval or subscription.interval
    day_of_month = body.day_of_month if body.day_of_month is not None else subscription.day_of_month
    month = body.month if body.month is not None else subscription.month
    if interval == "yearly" and month is None:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, "A yearly subscription needs a month"
        )

    if "place_id" in sent:
        where_name = body.merchant if body.merchant is not None else subscription.merchant
        subscription.place_id, subscription.merchant = await resolve_where(
            db, user, body.place_id, where_name
        )
    elif body.merchant is not None:
        subscription.merchant = body.merchant or None
    if body.description is not None or "description" in sent:
        subscription.description = body.description or None
    if body.currency is not None:
        subscription.currency = body.currency.upper()
    if body.amount is not None:
        subscription.amount_minor = to_minor(body.amount, subscription.currency) or 0
    if body.note is not None or "note" in sent:
        subscription.note = body.note or None

    # Any change to the schedule re-derives the next run date, on or after
    # today so a moved schedule never re-fires a date that already happened.
    if body.interval is not None or body.day_of_month is not None or body.month is not None:
        subscription.interval = interval
        subscription.day_of_month = day_of_month
        subscription.month = month if interval == "yearly" else None
        subscription.next_run_on = next_occurrence(
            interval, day_of_month, subscription.month, on_or_after=datetime.now(UTC).date()
        )

    await db.commit()
    if "place_id" in sent:
        await db.refresh(subscription, attribute_names=["place"])
    return subscription_out(subscription)


@router.delete("/{subscription_id}", status_code=204)
async def delete_subscription(subscription_id: int, user: CurrentUser, db: DbSession):
    """Soft delete: past expenses keep their link back to this subscription,
    and it simply stops being picked up by the periodic job."""
    subscription = await _get_owned(db, user.id, subscription_id)
    subscription.deleted_at = datetime.now(UTC)
    await db.commit()
