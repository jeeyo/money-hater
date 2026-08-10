from datetime import UTC, datetime

import sqlalchemy as sa

import app.services.analysis as analysis_mod
from app.models import Expense
from app.services.analysis import run_image_analysis
from app.services.money import normalize_currency, to_minor
from app.services.vision import (
    ReceiptData,
    ReceiptItem,
    VisionResult,
    parse_receipt_datetime,
)
from tests.conftest import register
from tests.util import make_jpeg

BKK = (13.7563, 100.5018)

RECEIPT_RESULT = VisionResult(
    kind="receipt",
    caption="Receipt from a ramen shop",
    labels=["receipt", "restaurant"],
    receipt=ReceiptData(
        merchant="Ramen Ya",
        datetime_iso="2026-08-08T13:05:00+07:00",
        currency="THB",
        total=345.50,
        tax=22.6,
        items=[
            ReceiptItem(name="Tonkotsu ramen", qty=2, unit_price=145.0, amount=290.0),
            ReceiptItem(name="Green tea", qty=1, amount=55.5),
        ],
    ),
)


def test_to_minor():
    assert to_minor(345.50, "THB") == 34550
    assert to_minor(1200, "JPY") == 1200
    assert to_minor(None, "USD") is None
    assert to_minor(10.005, "USD") == 1001  # half-up rounding


def test_parse_receipt_datetime():
    parsed = parse_receipt_datetime("2026-08-08T13:05:00+07:00")
    assert parsed is not None and parsed.utcoffset() is not None
    naive = parse_receipt_datetime("2026-08-08T13:05:00")
    assert naive is not None and naive.tzinfo is UTC
    assert parse_receipt_datetime("not a date") is None
    assert parse_receipt_datetime(None) is None


async def test_receipt_creates_expense(client, db_sessionmaker, monkeypatch):
    await register(client)
    created = (
        await client.post(
            "/api/images",
            files=[
                ("files", ("receipt.jpg", make_jpeg(*BKK, color=(250, 250, 250)), "image/jpeg"))
            ],
        )
    ).json()
    image_id = created[0]["id"]

    async def fake_vision(path, mime):
        return RECEIPT_RESULT

    monkeypatch.setattr(analysis_mod, "analyze_image_content", fake_vision)

    async with db_sessionmaker() as db:
        await run_image_analysis(db, image_id)

    async with db_sessionmaker() as db:
        expense = await db.scalar(
            sa.select(Expense).options(sa.orm.selectinload(Expense.items))
        )
        assert expense is not None
        assert expense.merchant == "Ramen Ya"
        assert expense.currency == "THB"
        assert expense.total_minor == 34550
        assert expense.tax_minor == 2260
        assert len(expense.items) == 2
        assert expense.items[0].amount_minor == 29000

    # Receipt timestamp replaces the weak upload-time fallback
    image = (await client.get(f"/api/images/{image_id}")).json()
    assert image["taken_at_source"] == "receipt"
    assert image["analysis"]["kind"] == "receipt"
    assert image["has_expense"] is True

    # Expense API surfaces it
    expenses = (await client.get("/api/expenses")).json()
    assert len(expenses) == 1
    summary = (await client.get("/api/expenses/summary")).json()
    assert summary["spend"]["base_currency"] == "THB"
    assert summary["spend"]["base_total_minor"] == 34550
    assert summary["spend"]["by_currency"] == [{"currency": "THB", "total_minor": 34550}]
    assert summary["by_merchant"][0]["merchant"] == "Ramen Ya"


async def test_expense_manual_correction(client, db_sessionmaker, monkeypatch):
    await register(client)
    created = (
        await client.post(
            "/api/images",
            files=[
                ("files", ("receipt.jpg", make_jpeg(*BKK, color=(240, 240, 240)), "image/jpeg"))
            ],
        )
    ).json()

    async def fake_vision(path, mime):
        return RECEIPT_RESULT

    monkeypatch.setattr(analysis_mod, "analyze_image_content", fake_vision)
    async with db_sessionmaker() as db:
        await run_image_analysis(db, created[0]["id"])

    expenses = (await client.get("/api/expenses")).json()
    response = await client.patch(
        f"/api/expenses/{expenses[0]['id']}",
        json={"merchant": "Ramen-Ya Ekamai", "total": "400.00"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["merchant"] == "Ramen-Ya Ekamai"
    assert body["total_minor"] == 40000
    # Base-currency total tracks the correction
    assert body["base_total_minor"] == 40000


async def test_vision_skipped_without_key(client, db_sessionmaker):
    """Without OPENAI_API_KEY the pipeline still completes with no analysis row."""
    await register(client)
    created = (
        await client.post(
            "/api/images",
            files=[("files", ("plain.jpg", make_jpeg(*BKK, color=(3, 30, 3)), "image/jpeg"))],
        )
    ).json()
    async with db_sessionmaker() as db:
        await run_image_analysis(db, created[0]["id"])
    image = (await client.get(f"/api/images/{created[0]['id']}")).json()
    assert image["status"] == "analyzed"
    assert image["analysis"] is None
    assert image["has_expense"] is False


def test_receipt_datetime_check_in_vision_result():
    assert RECEIPT_RESULT.receipt is not None
    parsed = parse_receipt_datetime(RECEIPT_RESULT.receipt.datetime_iso)
    assert parsed == datetime(2026, 8, 8, 6, 5, tzinfo=UTC)


def test_normalize_currency():
    assert normalize_currency("thb") == "THB"
    assert normalize_currency(" jpy ") == "JPY"
    # Anything that is not three ASCII letters is not a code we can store
    assert normalize_currency("PPTN") is None
    assert normalize_currency("¥") is None
    assert normalize_currency("TH") is None
    assert normalize_currency("12") is None
    assert normalize_currency("") is None
    assert normalize_currency(None) is None


async def test_a_currency_the_model_invented_does_not_sink_the_receipt(
    client, db_sessionmaker, monkeypatch
):
    """`expenses.currency` is varchar(3); a model reading a receipt is not.

    A Chinese receipt came back with the currency read as "PPTN", and the
    fourth character was not a wrong label in the UI — it was a failed INSERT
    that took the whole analysis down and left the photo showing a raw
    StringDataRightTruncationError on the upload page.
    """
    await register(client)
    created = (
        await client.post(
            "/api/images",
            files=[("files", ("cn.jpg", make_jpeg(*BKK, color=(210, 30, 30)), "image/jpeg"))],
        )
    ).json()
    image_id = created[0]["id"]

    async def fake_vision(path, mime):
        return VisionResult(
            kind="receipt",
            caption="Receipt from a hotpot place",
            labels=["receipt"],
            receipt=ReceiptData(
                merchant="遥记砂锅牛羊水店", currency="PPTN", total=86.21, tax=7.12
            ),
        )

    monkeypatch.setattr(analysis_mod, "analyze_image_content", fake_vision)

    async with db_sessionmaker() as db:
        await run_image_analysis(db, image_id)

    async with db_sessionmaker() as db:
        expense = await db.scalar(sa.select(Expense))
    assert expense is not None
    assert expense.currency == "THB", "falls back to the user's own currency"
    assert expense.total_minor == 8621
    assert expense.merchant == "遥记砂锅牛羊水店"
    assert "PPTN" in (expense.note or ""), "and says what it read, so it can be corrected"

    image = (await client.get(f"/api/images/{image_id}")).json()
    assert image["status"] == "analyzed"
    assert image["error"] is None


async def test_a_merchant_longer_than_the_column_is_kept_not_fatal(
    client, db_sessionmaker, monkeypatch
):
    await register(client)
    created = (
        await client.post(
            "/api/images",
            files=[("files", ("long.jpg", make_jpeg(*BKK, color=(11, 200, 60)), "image/jpeg"))],
        )
    ).json()

    async def fake_vision(path, mime):
        return VisionResult(
            kind="receipt",
            caption="A receipt",
            labels=["receipt"],
            receipt=ReceiptData(merchant="Very Long Name " * 40, currency="THB", total=10.0),
        )

    monkeypatch.setattr(analysis_mod, "analyze_image_content", fake_vision)

    async with db_sessionmaker() as db:
        await run_image_analysis(db, created[0]["id"])

    async with db_sessionmaker() as db:
        expense = await db.scalar(sa.select(Expense))
    assert expense is not None and len(expense.merchant) == 255
