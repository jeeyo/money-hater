"""The date on a receipt photo answers for the money read off it.

A receipt regularly lands on the wrong day: a screenshot carries no timestamp
of its own, so it is filed under the day it was uploaded. The user fixes that
on the photo, where the date picker is — and the expense, whose date came from
that same photo, has to follow rather than make them correct the same day
twice.
"""

from datetime import UTC, datetime

import sqlalchemy as sa

import app.services.analysis as analysis_mod
from app.models import Expense, Image
from app.services.analysis import run_image_analysis
from app.services.vision import ReceiptData, VisionResult
from tests.conftest import register
from tests.test_receipts import RECEIPT_RESULT
from tests.util import make_jpeg

# The same receipt with nothing printed on it to date it, so the expense can
# only take its time from the photo.
UNDATED_RECEIPT = VisionResult(
    kind="receipt",
    caption="Receipt from a ramen shop",
    labels=["receipt"],
    receipt=ReceiptData(merchant="Ramen Ya", currency="THB", total=345.50),
)


async def _a_receipt_photo(client, db_sessionmaker, monkeypatch, result, **jpeg) -> int:
    async def fake_vision(path, mime):
        return result

    monkeypatch.setattr(analysis_mod, "analyze_image_content", fake_vision)
    created = (
        await client.post(
            "/api/images",
            files=[("files", ("receipt.jpg", make_jpeg(**jpeg), "image/jpeg"))],
        )
    ).json()
    async with db_sessionmaker() as db:
        await run_image_analysis(db, created[0]["id"])
    return created[0]["id"]


async def _expense(db_sessionmaker) -> Expense:
    async with db_sessionmaker() as db:
        return await db.scalar(sa.select(Expense))


async def _spent_at(client) -> str:
    return (await client.get("/api/expenses")).json()[0]["spent_at"]


async def test_correcting_the_photos_date_moves_the_expense(
    client, db_sessionmaker, monkeypatch
):
    await register(client)
    image_id = await _a_receipt_photo(
        client,
        db_sessionmaker,
        monkeypatch,
        UNDATED_RECEIPT,
        taken_at=datetime(2026, 8, 8, 13, 0, tzinfo=UTC),
    )
    assert (await _spent_at(client)).startswith("2026-08-08T13:00")

    await client.patch(f"/api/images/{image_id}", json={"taken_at": "2026-08-09T17:45:00Z"})

    assert (await _spent_at(client)).startswith("2026-08-09T17:45")


async def test_correcting_it_again_moves_the_date_it_had_handed_over(
    client, db_sessionmaker, monkeypatch
):
    """The expense is still carrying the photo's answer, so it gets the new one."""
    await register(client)
    image_id = await _a_receipt_photo(
        client,
        db_sessionmaker,
        monkeypatch,
        UNDATED_RECEIPT,
        taken_at=datetime(2026, 8, 8, 13, 0, tzinfo=UTC),
    )

    await client.patch(f"/api/images/{image_id}", json={"taken_at": "2026-08-09T17:45:00Z"})
    await client.patch(f"/api/images/{image_id}", json={"taken_at": "2026-08-10T09:15:00Z"})

    assert (await _spent_at(client)).startswith("2026-08-10T09:15")


async def test_reverting_the_photo_to_exif_takes_the_expense_back_with_it(
    client, db_sessionmaker, monkeypatch
):
    await register(client)
    image_id = await _a_receipt_photo(
        client,
        db_sessionmaker,
        monkeypatch,
        UNDATED_RECEIPT,
        taken_at=datetime(2026, 8, 8, 13, 0, tzinfo=UTC),
    )
    await client.patch(f"/api/images/{image_id}", json={"taken_at": "2026-08-09T17:45:00Z"})

    await client.patch(f"/api/images/{image_id}", json={"taken_at": None})

    assert (await _spent_at(client)).startswith("2026-08-08T13:00")


async def test_a_date_set_on_the_expense_is_not_overwritten(
    client, db_sessionmaker, monkeypatch
):
    """The user has already answered this question on the money itself."""
    await register(client)
    image_id = await _a_receipt_photo(
        client,
        db_sessionmaker,
        monkeypatch,
        UNDATED_RECEIPT,
        taken_at=datetime(2026, 8, 8, 13, 0, tzinfo=UTC),
    )
    expense = await _expense(db_sessionmaker)
    await client.patch(f"/api/expenses/{expense.id}", json={"spent_at": "2026-08-07T20:00:00Z"})

    await client.patch(f"/api/images/{image_id}", json={"taken_at": "2026-08-09T17:45:00Z"})

    assert (await _spent_at(client)).startswith("2026-08-07T20:00")


async def test_the_date_printed_on_the_receipt_is_left_alone(
    client, db_sessionmaker, monkeypatch
):
    """When the receipt says when the money went, the photo's clock does not."""
    await register(client)
    image_id = await _a_receipt_photo(
        client,
        db_sessionmaker,
        monkeypatch,
        RECEIPT_RESULT,
        taken_at=datetime(2026, 8, 8, 20, 0, tzinfo=UTC),
    )
    # 13:05 as the receipt printed it, not the 20:00 the photo was taken at.
    printed = await _spent_at(client)
    assert printed.startswith("2026-08-08T13:05")

    await client.patch(f"/api/images/{image_id}", json={"taken_at": "2026-08-09T17:45:00Z"})

    assert await _spent_at(client) == printed


async def test_the_expense_follows_the_photo_to_the_stop_it_moved_to(
    client, db_sessionmaker, monkeypatch
):
    """A correction re-files the expense under the stop the photo now belongs to."""
    await register(client)
    image_id = await _a_receipt_photo(
        client,
        db_sessionmaker,
        monkeypatch,
        UNDATED_RECEIPT,
        lat=13.7563,
        lng=100.5018,
        taken_at=datetime(2026, 8, 8, 13, 0, tzinfo=UTC),
    )

    await client.patch(f"/api/images/{image_id}", json={"taken_at": "2026-08-09T17:45:00Z"})

    async with db_sessionmaker() as db:
        expense = await db.scalar(sa.select(Expense))
        image = await db.get(Image, image_id)
        assert expense.visit_id == image.visit_id
