"""Money arithmetic in integer minor units.

Every amount is stored as an integer in its currency's minor unit (satang for
THB, yen for JPY) alongside its ISO 4217 code. Conversions go through Decimal
so rates never introduce binary-float drift.
"""

from decimal import ROUND_HALF_UP, Decimal

# ISO 4217 currencies whose minor unit == major unit
ZERO_DECIMAL = {"JPY", "KRW", "VND", "CLP", "ISK", "UGX", "RWF", "XAF", "XOF", "XPF"}

DEFAULT_BASE_CURRENCY = "THB"


def normalize_currency(value: str | None) -> str | None:
    """A code that can be stored as one, or None if this is not one.

    Every currency the API accepts is length-checked at its schema, but the one
    read off a receipt arrives from a vision model and is whatever it thought it
    saw — "PPTN" off a Chinese receipt, say. The column is `varchar(3)`, so a
    fourth character is not a wrong answer that shows up in the UI, it is a
    failed INSERT that takes the whole analysis down with it.
    """
    if value is None:
        return None
    code = value.strip().upper()
    return code if len(code) == 3 and code.isascii() and code.isalpha() else None


def minor_factor(currency: str) -> int:
    return 1 if currency.upper() in ZERO_DECIMAL else 100


def to_minor(amount: Decimal | float | int | None, currency: str) -> int | None:
    if amount is None:
        return None
    value = Decimal(str(amount)) * minor_factor(currency)
    return int(value.quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def to_major(minor: int | None, currency: str) -> Decimal | None:
    if minor is None:
        return None
    return (Decimal(minor) / minor_factor(currency)).quantize(
        Decimal("0.01") if minor_factor(currency) == 100 else Decimal("1")
    )


def convert_minor(
    minor: int | None, from_currency: str, to_currency: str, rate: Decimal | float | None
) -> int | None:
    """Convert an amount given `rate` = units of to_currency per 1 from_currency."""
    if minor is None or rate is None:
        return None
    if from_currency.upper() == to_currency.upper():
        return minor
    major = Decimal(minor) / minor_factor(from_currency)
    return to_minor(major * Decimal(str(rate)), to_currency)
