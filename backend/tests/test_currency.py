"""Multi-currency: conversion maths, the review queue, and manual rate overrides."""

from datetime import UTC, datetime
from decimal import Decimal

import pytest

import app.services.expenses as expenses_mod
import app.services.fx as fx_mod
from app.models import ExchangeRate
from app.services.money import convert_minor, to_major, to_minor
from tests.conftest import register

# 1 JPY = 0.235 THB
JPY_THB = Decimal("0.235")


@pytest.fixture
def fake_rate(monkeypatch):
    """Avoid hitting the live FX API in tests."""

    async def _fetch(from_currency, to_currency):
        if (from_currency, to_currency) == ("JPY", "THB"):
            return JPY_THB, datetime(2026, 8, 7, tzinfo=UTC).date()
        return None

    monkeypatch.setattr(fx_mod, "_fetch_rate", _fetch)


def test_convert_minor_across_decimal_places():
    # 1200 JPY (zero-decimal) at 0.235 -> 282.00 THB -> 28200 satang
    assert convert_minor(1200, "JPY", "THB", JPY_THB) == 28200
    # Same currency is a passthrough regardless of rate
    assert convert_minor(34550, "THB", "THB", Decimal(1)) == 34550
    # No rate -> no converted amount, never a wrong one
    assert convert_minor(1200, "JPY", "THB", None) is None


def test_to_major_round_trip():
    assert to_major(34550, "THB") == Decimal("345.50")
    assert to_major(1200, "JPY") == Decimal("1200")
    assert to_minor(to_major(34550, "THB"), "THB") == 34550


async def test_rate_is_cached_after_first_lookup(db, fake_rate, monkeypatch):
    calls = []
    original = fx_mod._fetch_rate

    async def counting(from_currency, to_currency):
        calls.append((from_currency, to_currency))
        return await original(from_currency, to_currency)

    monkeypatch.setattr(fx_mod, "_fetch_rate", counting)

    assert await fx_mod.get_rate(db, "JPY", "THB") == JPY_THB
    await db.commit()
    assert await fx_mod.get_rate(db, "JPY", "THB") == JPY_THB
    assert len(calls) == 1  # second call served from the cache table

    cached = (await db.execute(ExchangeRate.__table__.select())).all()
    assert len(cached) == 1


async def test_same_currency_needs_no_rate(db, fake_rate):
    called = False

    async def _never(*args, **kwargs):
        nonlocal called
        called = True

    assert await fx_mod.get_rate(db, "THB", "THB") == Decimal(1)
    assert called is False


async def test_foreign_expense_is_converted_and_flagged(client, fake_rate):
    await register(client)
    response = await client.post(
        "/api/expenses",
        json={"total": "1200", "currency": "JPY", "merchant": "Ichiran Shinjuku"},
    )
    assert response.status_code == 201, response.text
    expense = response.json()
    assert expense["currency"] == "JPY"
    assert expense["total_minor"] == 1200
    assert expense["base_currency"] == "THB"
    assert expense["base_total_minor"] == 28200
    assert expense["fx_rate"] == pytest.approx(0.235)
    assert expense["fx_rate_source"] == "api"
    # A looked-up rate is a suggestion, so it waits for confirmation
    assert expense["needs_review"] is True

    review = (await client.get("/api/expenses", params={"needs_review": True})).json()
    assert [e["id"] for e in review] == [expense["id"]]


async def test_confirming_accepts_or_overrides_the_rate(client, fake_rate):
    await register(client)
    expense = (
        await client.post("/api/expenses", json={"total": "1200", "currency": "JPY"})
    ).json()

    # Override with the rate the card actually charged
    response = await client.post(
        f"/api/expenses/{expense['id']}/confirm", json={"fx_rate": "0.25"}
    )
    assert response.status_code == 200
    confirmed = response.json()
    assert confirmed["needs_review"] is False
    assert confirmed["fx_rate_source"] == "manual"
    assert confirmed["base_total_minor"] == 30000  # 1200 * 0.25 THB

    assert (await client.get("/api/expenses", params={"needs_review": True})).json() == []


async def test_confirming_without_a_rate_accepts_the_suggestion(client, fake_rate):
    await register(client)
    expense = (
        await client.post("/api/expenses", json={"total": "1200", "currency": "JPY"})
    ).json()
    confirmed = (
        await client.post(f"/api/expenses/{expense['id']}/confirm", json={})
    ).json()
    assert confirmed["needs_review"] is False
    assert confirmed["base_total_minor"] == 28200


async def test_manual_rate_at_creation_skips_review(client, fake_rate):
    await register(client)
    expense = (
        await client.post(
            "/api/expenses",
            json={"total": "1200", "currency": "JPY", "fx_rate": "0.24"},
        )
    ).json()
    assert expense["needs_review"] is False
    assert expense["fx_rate_source"] == "manual"
    assert expense["base_total_minor"] == 28800


async def test_unavailable_rate_leaves_amount_unconverted(client, monkeypatch):
    """FX outage must not invent a number — the expense waits for the user."""

    async def _no_rate(from_currency, to_currency):
        return None

    monkeypatch.setattr(fx_mod, "_fetch_rate", _no_rate)
    await register(client)
    expense = (
        await client.post("/api/expenses", json={"total": "50", "currency": "EUR"})
    ).json()
    assert expense["base_total_minor"] is None
    assert expense["fx_rate"] is None
    assert expense["needs_review"] is True

    # Confirming needs an explicit rate in that case
    assert (
        await client.post(f"/api/expenses/{expense['id']}/confirm", json={})
    ).status_code == 422
    confirmed = (
        await client.post(
            f"/api/expenses/{expense['id']}/confirm", json={"fx_rate": "38.5"}
        )
    ).json()
    assert confirmed["base_total_minor"] == 192500  # 50 EUR * 38.5


async def test_rate_quote_endpoint(client, fake_rate):
    await register(client)
    response = await client.get(
        "/api/expenses/rate", params={"from_currency": "JPY", "amount": "1200"}
    )
    assert response.status_code == 200
    quote = response.json()
    assert quote["to_currency"] == "THB"
    assert quote["rate"] == pytest.approx(0.235)
    assert quote["converted_minor"] == 28200


async def test_summary_rolls_mixed_currencies_into_base(client, fake_rate):
    await register(client)
    await client.post("/api/expenses", json={"total": "345.50", "currency": "THB"})
    jpy = (
        await client.post("/api/expenses", json={"total": "1200", "currency": "JPY"})
    ).json()

    summary = (await client.get("/api/expenses/summary")).json()
    assert summary["spend"]["base_currency"] == "THB"
    assert summary["spend"]["base_total_minor"] == 34550 + 28200
    assert summary["spend"]["by_currency"] == [
        {"currency": "JPY", "total_minor": 1200},
        {"currency": "THB", "total_minor": 34550},
    ]
    assert summary["spend"]["unconfirmed_count"] == 1
    assert summary["needs_review_count"] == 1

    await client.post(f"/api/expenses/{jpy['id']}/confirm", json={})
    summary = (await client.get("/api/expenses/summary")).json()
    assert summary["needs_review_count"] == 0


async def test_base_currency_follows_user_setting(client, fake_rate, monkeypatch):
    """A user who thinks in JPY sees THB spending converted, not the reverse."""

    async def _fetch(from_currency, to_currency):
        if (from_currency, to_currency) == ("THB", "JPY"):
            return Decimal("4.25"), datetime(2026, 8, 7, tzinfo=UTC).date()
        return None

    monkeypatch.setattr(fx_mod, "_fetch_rate", _fetch)
    monkeypatch.setattr(expenses_mod.fx, "_fetch_rate", _fetch, raising=False)

    await register(client)
    await client.patch("/api/auth/me", json={"preferred_currency": "JPY"})
    expense = (
        await client.post("/api/expenses", json={"total": "100", "currency": "THB"})
    ).json()
    assert expense["base_currency"] == "JPY"
    assert expense["base_total_minor"] == 425  # 100 THB * 4.25
