"""Dates, times and money as the exported page spells them.

Deliberately not locale-aware. The app's own screens format in the reader's
browser through `Intl`; a cached file cannot, because the cache is keyed by what
the page says and a per-request locale would mean one entry per locale for
pages that are otherwise identical. One fixed spelling also means the person who
sent a page and the person who opens it read the same numbers.

Stored moments are wall clocks — the time that was on the wall where the thing
happened, carried in a UTC-shaped column (see `app.services.localtime`). They are
read back field by field here, never converted, for the same reason the frontend
passes `timeZone: 'UTC'`: adding the reader's offset would move a 20:36 dinner in
Bangkok onto the next morning.
"""

from datetime import date, datetime
from decimal import Decimal

from app.schemas import SpendOut
from app.services.money import minor_factor

WEEKDAYS = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")
MONTHS = (
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
)


def format_money(total_minor: int, currency: str) -> str:
    """"THB 1,380.00" — the code rather than a symbol, which needs a locale."""
    factor = minor_factor(currency)
    if factor == 1:
        return f"{currency} {total_minor:,}"
    return f"{currency} {Decimal(total_minor) / 100:,.2f}"


def format_spend(spend: SpendOut) -> str:
    """Always the base currency; foreign originals follow in parentheses, so a
    trip abroad still shows what was actually handed over."""
    base = format_money(spend.base_total_minor, spend.base_currency)
    foreign = [c for c in spend.by_currency if c.currency != spend.base_currency]
    if not foreign:
        return base
    detail = " + ".join(format_money(c.total_minor, c.currency) for c in foreign)
    return f"{base} ({detail})"


def format_day(value: date | datetime | str) -> str:
    """"Sat, Sep 12, 2026"."""
    if isinstance(value, str):
        value = date.fromisoformat(value[:10])
    return f"{WEEKDAYS[value.weekday()]}, {MONTHS[value.month - 1]} {value.day}, {value.year}"


def format_time(moment: datetime) -> str:
    """"02:40 PM"."""
    hour = moment.hour % 12 or 12
    meridiem = "AM" if moment.hour < 12 else "PM"
    return f"{hour:02d}:{moment.minute:02d} {meridiem}"
