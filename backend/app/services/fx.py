"""Foreign exchange rates, cached daily in Postgres.

Rates come from Frankfurter (ECB reference rates, no API key). A rate is
always expressed as "units of `to_currency` per 1 unit of `from_currency`".
If the rate can't be fetched the expense simply carries no converted amount
and stays in the confirmation queue for the user to fill in by hand.
"""

import logging
from datetime import UTC, date, datetime
from decimal import Decimal

import httpx
import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import ExchangeRate

log = logging.getLogger(__name__)


async def _latest_cached(
    db: AsyncSession, from_currency: str, to_currency: str
) -> ExchangeRate | None:
    return await db.scalar(
        sa.select(ExchangeRate)
        .where(
            ExchangeRate.from_currency == from_currency,
            ExchangeRate.to_currency == to_currency,
        )
        .order_by(ExchangeRate.as_of_date.desc())
        .limit(1)
    )


async def _cached_for_date(
    db: AsyncSession, from_currency: str, to_currency: str, as_of: date
) -> ExchangeRate | None:
    return await db.scalar(
        sa.select(ExchangeRate).where(
            ExchangeRate.from_currency == from_currency,
            ExchangeRate.to_currency == to_currency,
            ExchangeRate.as_of_date == as_of,
        )
    )


async def _fetch_rate(from_currency: str, to_currency: str) -> tuple[Decimal, date] | None:
    if not settings.exchange_rate_api_url:
        return None
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(
                settings.exchange_rate_api_url,
                params={"base": from_currency, "symbols": to_currency},
            )
            response.raise_for_status()
            payload = response.json()
        rate = payload["rates"][to_currency]
        as_of = datetime.strptime(payload["date"], "%Y-%m-%d").date()
    except (httpx.HTTPError, KeyError, ValueError) as exc:
        log.warning("FX lookup %s->%s failed: %s", from_currency, to_currency, exc)
        return None
    return Decimal(str(rate)), as_of


async def get_rate(db: AsyncSession, from_currency: str, to_currency: str) -> Decimal | None:
    """Today's rate, from cache when possible. Returns None if unavailable."""
    from_currency, to_currency = from_currency.upper(), to_currency.upper()
    if from_currency == to_currency:
        return Decimal(1)

    now = datetime.now(UTC)
    today = now.date()
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    # ECB publishes on weekdays only, so the newest rate is often dated
    # earlier than today. Reuse it when we already looked today — that caps
    # the API at one call per pair per day instead of one per expense.
    latest = await _latest_cached(db, from_currency, to_currency)
    if latest is not None:
        fetched_at = latest.fetched_at
        if fetched_at is not None and fetched_at.tzinfo is None:
            fetched_at = fetched_at.replace(tzinfo=UTC)
        if latest.as_of_date == today or (fetched_at and fetched_at >= day_start):
            return Decimal(str(latest.rate))

    fetched = await _fetch_rate(from_currency, to_currency)
    if fetched is None:
        # Outage or no API configured: a stale rate beats no rate, and the
        # expense stays in the confirmation queue either way.
        return Decimal(str(latest.rate)) if latest is not None else None

    rate, as_of = fetched
    existing = await _cached_for_date(db, from_currency, to_currency, as_of)
    if existing is None:
        db.add(
            ExchangeRate(
                from_currency=from_currency,
                to_currency=to_currency,
                rate=rate,
                as_of_date=as_of,
                fetched_at=now,
            )
        )
    else:
        existing.rate = rate
        existing.fetched_at = now
    await db.flush()
    return rate
