"""Analyzing the same photo twice.

"Re-analyze" is a button in the photo sheet, and it is the first thing anyone
presses when a photo came back without a place. Every write the pipeline makes
therefore has to be a replacement or a no-op — appending a second analysis row
(the image id is that table's primary key) or a second expense (the column is
unique) failed the whole run, leaving the photo cycling through 'processing'
and 'failed' with nothing to show for it.
"""

import asyncio
from datetime import UTC, datetime

import pytest
import sqlalchemy as sa

import app.services.analysis as analysis_mod
from app.models import Expense, Image, ImageAnalysis, Place
from app.services.analysis import run_image_analysis
from app.services.vision import ReceiptData, VisionResult
from tests.conftest import register
from tests.util import make_jpeg

BKK = (13.7563, 100.5018)

A_PLACE = VisionResult(kind="place", caption="A shophouse corner", labels=["street", "corner"])
A_RECEIPT = VisionResult(
    kind="receipt",
    caption="Receipt from a cafe",
    labels=["receipt"],
    receipt=ReceiptData(merchant="Kopi 1930", currency="THB", total=180.0),
)


async def _upload(client, name="a.jpg", color=(4, 4, 4)) -> int:
    response = await client.post(
        "/api/images",
        files=[
            (
                "files",
                (
                    name,
                    make_jpeg(*BKK, taken_at=datetime(2026, 8, 8, 12, 0, tzinfo=UTC), color=color),
                    "image/jpeg",
                ),
            )
        ],
    )
    assert response.status_code == 201, response.text
    return response.json()[0]["id"]


def _stub_vision(monkeypatch, result: VisionResult | None):
    async def fake_vision(path, mime):
        return result

    monkeypatch.setattr(analysis_mod, "analyze_image_content", fake_vision)


async def test_analyzing_twice_replaces_the_reading(client, db_sessionmaker, monkeypatch):
    await register(client)
    image_id = await _upload(client)
    _stub_vision(monkeypatch, A_PLACE)

    async with db_sessionmaker() as db:
        await run_image_analysis(db, image_id)

    _stub_vision(
        monkeypatch,
        VisionResult(kind="food", caption="A bowl of noodles", labels=["ramen"]),
    )
    async with db_sessionmaker() as db:
        await run_image_analysis(db, image_id)

    async with db_sessionmaker() as db:
        assert await db.scalar(sa.select(sa.func.count()).select_from(ImageAnalysis)) == 1
        analysis = await db.get(ImageAnalysis, image_id)
        assert analysis.kind == "food"
        assert analysis.caption == "A bowl of noodles"
        assert (await db.get(Image, image_id)).status == "analyzed"


async def test_reanalyzing_a_receipt_does_not_bill_it_twice(
    client, db_sessionmaker, monkeypatch
):
    await register(client)
    image_id = await _upload(client, "receipt.jpg", color=(250, 250, 250))
    _stub_vision(monkeypatch, A_RECEIPT)

    async with db_sessionmaker() as db:
        await run_image_analysis(db, image_id)
    async with db_sessionmaker() as db:
        await run_image_analysis(db, image_id)

    async with db_sessionmaker() as db:
        expenses = (await db.execute(sa.select(Expense))).scalars().all()
        assert len(expenses) == 1
        assert expenses[0].total_minor == 18000
        assert (await db.get(Image, image_id)).status == "analyzed"


async def test_a_place_the_user_picked_survives_reanalysis(
    client, db_sessionmaker, monkeypatch
):
    """The whole point of correcting a photo is that the correction sticks."""
    await register(client)
    image_id = await _upload(client)
    _stub_vision(monkeypatch, A_PLACE)
    async with db_sessionmaker() as db:
        await run_image_analysis(db, image_id)

    async with db_sessionmaker() as db:
        mine = Place(
            google_place_id="ChIJ-mine",
            name="The one it actually was",
            lat=BKK[0],
            lng=BKK[1],
        )
        nearer = Place(
            google_place_id="ChIJ-shop-next-door",
            name="The shop next door",
            lat=BKK[0],
            lng=BKK[1],
        )
        db.add_all([mine, nearer])
        await db.commit()
        chosen = mine.id

    assert (
        await client.patch(f"/api/images/{image_id}", json={"place_id": chosen})
    ).status_code == 200

    async with db_sessionmaker() as db:
        await run_image_analysis(db, image_id)

    async with db_sessionmaker() as db:
        image = await db.get(Image, image_id)
        assert image.place_id == chosen
        assert image.status == "analyzed"


async def test_removing_a_place_survives_reanalysis(client, db_sessionmaker, monkeypatch):
    """Taking one off is an answer too, not an absence waiting to be filled."""
    await register(client)
    image_id = await _upload(client)
    _stub_vision(monkeypatch, A_PLACE)
    async with db_sessionmaker() as db:
        db.add(Place(google_place_id="ChIJ-near", name="Somewhere", lat=BKK[0], lng=BKK[1]))
        await db.commit()
        await run_image_analysis(db, image_id)

    async with db_sessionmaker() as db:
        assert (await db.get(Image, image_id)).place_id is not None

    await client.patch(f"/api/images/{image_id}", json={"place_id": None})

    async with db_sessionmaker() as db:
        await run_image_analysis(db, image_id)

    async with db_sessionmaker() as db:
        assert (await db.get(Image, image_id)).place_id is None


async def test_a_model_that_never_answers_does_not_park_the_photo(
    client, db_sessionmaker, monkeypatch
):
    """A photo logged without a caption beats one that never leaves 'Analyzing'."""
    from app.config import settings

    await register(client)
    image_id = await _upload(client)
    monkeypatch.setattr(settings, "vision_timeout_seconds", 0.05)

    async def hangs(path, mime):
        await asyncio.sleep(30)

    monkeypatch.setattr(analysis_mod, "analyze_image_content", hangs)

    async with db_sessionmaker() as db:
        await run_image_analysis(db, image_id)

    async with db_sessionmaker() as db:
        image = await db.get(Image, image_id)
        assert image.status == "analyzed"
        assert image.error is None
        assert await db.get(ImageAnalysis, image_id) is None


async def test_a_database_failure_is_not_shown_as_sql(client, db_sessionmaker, monkeypatch):
    """`image.error` is rendered verbatim under the photo on the upload page.

    A driver error stringifies to the entire failed statement — every column,
    every bound parameter — which filled the phone with INSERT and told the
    user nothing. The detail belongs in the log.
    """
    from sqlalchemy.exc import DBAPIError

    await register(client)
    image_id = await _upload(client, "boom.jpg", color=(6, 6, 6))
    _stub_vision(monkeypatch, A_RECEIPT)

    # Where the reported failure actually landed: writing the expense
    async def explode(db, image, result, user, **kwargs):
        raise DBAPIError(
            "INSERT INTO expenses (user_id, image_id, currency) VALUES ($1, $2, $3)",
            {"currency": "PPTN"},
            Exception("value too long for type character varying(3)"),
        )

    monkeypatch.setattr(analysis_mod, "_apply_receipt", explode)

    async with db_sessionmaker() as db:
        with pytest.raises(DBAPIError):
            await run_image_analysis(db, image_id)

    async with db_sessionmaker() as db:
        image = await db.get(Image, image_id)
    assert image.status == "failed"
    assert "INSERT" not in image.error and "$1" not in image.error
    assert len(image.error) < 120


async def test_an_ordinary_failure_still_says_what_happened(
    client, db_sessionmaker, monkeypatch
):
    await register(client)
    image_id = await _upload(client, "gone.jpg", color=(8, 8, 8))

    def explode(original):
        raise FileNotFoundError("the original is missing from disk")

    monkeypatch.setattr(analysis_mod.storage, "make_thumbnail", explode)

    async with db_sessionmaker() as db:
        with pytest.raises(FileNotFoundError):
            await run_image_analysis(db, image_id)

    async with db_sessionmaker() as db:
        assert "missing from disk" in (await db.get(Image, image_id)).error
