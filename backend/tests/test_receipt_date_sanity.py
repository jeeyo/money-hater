"""A receipt cannot be from 2019 if the photo of it was taken this week.

The purchase date is the one thing on a receipt the model reads worst and the
phone knows best. A thermal print fades from the date line outwards, `08/07/19`
is three ambiguities in a row, and a model asked what it says will answer 2019
with no hedging at all. An expense filed seven years back is not a small error:
it is off the timeline, out of this month's total, and nowhere anyone would
think to look for it — so a printed date a long way from the photograph is
dropped, and the photo's own day stands.
"""

from datetime import UTC, datetime, timedelta

import sqlalchemy as sa

import app.services.analysis as analysis_mod
from app.models import Expense, Image
from app.services.analysis import run_image_analysis
from app.services.vision import ReceiptData, VisionResult, parse_receipt_datetime
from tests.conftest import register
from tests.util import make_jpeg

PHOTO = datetime(2026, 8, 8, 13, 0, tzinfo=UTC)


def _receipt(datetime_iso: str | None) -> VisionResult:
    return VisionResult(
        kind="receipt",
        caption="Receipt from a ramen shop",
        labels=["receipt"],
        receipt=ReceiptData(
            merchant="Ramen Ya",
            datetime_iso=datetime_iso,
            currency="THB",
            total=345.50,
        ),
    )


def test_a_year_misread_off_the_print_is_dropped():
    assert parse_receipt_datetime("2019-08-08T13:05:00", reference=PHOTO) is None


def test_a_date_beside_the_photo_is_kept():
    assert parse_receipt_datetime("2026-08-08T13:05:00", reference=PHOTO) == datetime(
        2026, 8, 8, 13, 5, tzinfo=UTC
    )


def test_the_shoebox_of_receipts_photographed_at_the_end_of_the_trip_still_counts():
    """Weeks is normal. It is years that means a digit was misread."""
    assert parse_receipt_datetime("2026-06-20T13:05:00", reference=PHOTO) is not None


def test_nothing_is_bought_long_after_it_is_photographed():
    assert parse_receipt_datetime("2026-09-08T13:05:00", reference=PHOTO) is None


def test_a_till_clock_slightly_ahead_is_tolerated():
    """A few hours out, or a date line crossed between till and camera."""
    printed = (PHOTO + timedelta(hours=14)).isoformat()
    assert parse_receipt_datetime(printed, reference=PHOTO) is not None


def test_with_nothing_to_check_against_the_print_is_taken_as_read():
    assert parse_receipt_datetime("2019-08-08T13:05:00") == datetime(
        2019, 8, 8, 13, 5, tzinfo=UTC
    )


async def test_a_screenshot_read_as_2019_is_filed_under_the_day_it_arrived(
    client, db_sessionmaker, monkeypatch
):
    """The case this exists for: no clock on the photo, a bad year on the print.

    A screenshot of a receipt carries no EXIF at all, so the printed line is
    normally allowed to date both the money and the photo. That is exactly when
    a misread year does the damage, and exactly when there is nothing else to
    catch it — bar the day the thing was uploaded.
    """

    async def fake_vision(path, mime, context=None):
        return _receipt("2019-08-08T13:05:00")

    monkeypatch.setattr(analysis_mod, "analyze_image_content", fake_vision)
    await register(client)
    created = (
        await client.post(
            "/api/images",
            files=[("files", ("shot.png", make_jpeg(color=(9, 9, 9)), "image/jpeg"))],
        )
    ).json()
    async with db_sessionmaker() as db:
        await run_image_analysis(db, created[0]["id"])

    async with db_sessionmaker() as db:
        image = await db.get(Image, created[0]["id"])
        expense = await db.scalar(sa.select(Expense))
        today = datetime.now(UTC).date()
        assert image.taken_at_source == "upload"
        assert image.taken_at.date() == today
        assert expense.spent_at.date() == today, "not 2019"


async def test_a_plausible_printed_date_still_dates_a_photo_with_no_clock(
    client, db_sessionmaker, monkeypatch
):
    """The guard only throws out the impossible; the print is still the evidence."""

    printed = datetime.now(UTC) - timedelta(days=3)

    async def fake_vision(path, mime, context=None):
        return _receipt(printed.strftime("%Y-%m-%dT%H:%M:%S"))

    monkeypatch.setattr(analysis_mod, "analyze_image_content", fake_vision)
    await register(client)
    created = (
        await client.post(
            "/api/images",
            files=[("files", ("shot.png", make_jpeg(color=(8, 8, 8)), "image/jpeg"))],
        )
    ).json()
    async with db_sessionmaker() as db:
        await run_image_analysis(db, created[0]["id"])

    async with db_sessionmaker() as db:
        image = await db.get(Image, created[0]["id"])
        expense = await db.scalar(sa.select(Expense))
        assert image.taken_at_source == "receipt"
        assert image.taken_at.date() == printed.date()
        assert expense.spent_at.date() == printed.date()
