"""The per-image analysis pipeline run by the worker.

Stages: EXIF -> thumbnail -> place resolution -> vision -> expense -> recluster.
Each stage degrades gracefully (no GPS, no API keys, unreadable receipt) so an
upload always ends in 'analyzed' unless something truly unexpected happens.

Running it a second time on the same photo has to work. "Re-analyze" is a
button in the UI, and it is the first thing anyone presses when a photo came
back without a place — so every write here either replaces what the previous
run wrote or leaves it be. Nothing appends.
"""

import asyncio
import logging
from datetime import UTC, datetime
from pathlib import Path

import sqlalchemy as sa
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import Expense, ExpenseItem, Image, ImageAnalysis, User
from app.services import storage
from app.services.clustering import recluster_user
from app.services.exif import extract_exif
from app.services.expenses import create_expense
from app.services.money import normalize_currency, to_minor
from app.services.places import resolve_place
from app.services.vision import (
    VisionResult,
    analyze_image_content,
    parse_receipt_datetime,
)

log = logging.getLogger(__name__)


async def _apply_exif(image: Image, data: bytes) -> None:
    exif = await asyncio.to_thread(extract_exif, data)
    if exif.taken_at:
        image.exif_taken_at = exif.taken_at
        if image.taken_at_source != "custom":
            image.taken_at = exif.taken_at
            image.taken_at_source = "exif"
    elif image.taken_at is None:
        # Only rows written before uploads carried the uploader's offset get
        # here, and `uploaded_at` is the best this side of the request has.
        # Never for a photo the upload already filed: that one holds the
        # uploader's wall clock, and `uploaded_at` is a UTC instant, so
        # re-analysing would drag it across the day by the whole offset.
        image.taken_at = image.uploaded_at
        image.taken_at_source = "upload"
    image.lat, image.lng = exif.lat, exif.lng
    image.exif = exif.raw or None


async def _apply_receipt(
    db: AsyncSession, image: Image, result: VisionResult, user: User
) -> None:
    receipt = result.receipt
    if result.kind != "receipt" or receipt is None or receipt.total is None:
        return
    # One expense per photo — the column is unique, and a second run used to
    # fail the whole analysis trying to add another. The money is already
    # recorded, possibly corrected by hand since (an edited total, a confirmed
    # rate), so re-reading the photo leaves it alone rather than overwriting
    # the user. Getting the amount right again is what editing the expense is
    # for.
    existing = await db.scalar(sa.select(Expense.id).where(Expense.image_id == image.id))
    if existing is not None:
        log.info("image %s already has expense %s; leaving it", image.id, existing)
        return
    # Everything below comes from a vision model reading a photo, so nothing is
    # the shape the columns promise until it is made so. What the model read is
    # kept verbatim in ImageAnalysis.raw either way.
    currency = normalize_currency(receipt.currency)
    note = None
    if currency is None:
        currency = user.preferred_currency
        if receipt.currency:
            # Say so rather than quietly denominating it in the wrong money —
            # the total is right, the label is a guess, and the note is what
            # lets someone spot that and correct it.
            log.info(
                "image %s: unusable currency %r from the model; recording as %s",
                image.id,
                receipt.currency,
                currency,
            )
            note = f"Currency read as {receipt.currency.strip()[:16]!r}; recorded as {currency}."
    spent_at = parse_receipt_datetime(receipt.datetime_iso)
    expense = await create_expense(
        db,
        user,
        image_id=image.id,
        source="receipt",
        merchant=receipt.merchant[:255] if receipt.merchant else None,
        # The photo's own GPS already told us where this was
        place_id=image.place_id,
        spent_at=spent_at or image.taken_at,
        currency=currency,
        total_minor=to_minor(receipt.total, currency) or 0,
        tax_minor=to_minor(receipt.tax, currency),
        tip_minor=to_minor(receipt.tip, currency),
        note=note,
    )
    for item in receipt.items:
        db.add(
            ExpenseItem(
                expense_id=expense.id,
                name=item.name[:255],
                qty=item.qty,
                unit_price_minor=to_minor(item.unit_price, currency),
                amount_minor=to_minor(item.amount, currency) or 0,
            )
        )
    # A receipt's printed time beats the upload-time fallback for the timeline
    if spent_at and image.taken_at_source == "upload":
        image.taken_at = spent_at
        image.taken_at_source = "receipt"


async def _run_vision(source: Path) -> VisionResult | None:
    """Read the photo, or give up on it within a bounded time.

    The provider call is the one step here with no natural end: the SDK's own
    timeout is ten minutes and it retries, so a slow afternoon at the API used
    to hold the row in 'processing' for half an hour a photo — which is what
    "stuck at Analyzing" looks like from the upload page. A photo logged
    without a caption is a far better outcome than one that never finishes, so
    the wait is capped and the rest of the pipeline carries on.
    """
    try:
        async with asyncio.timeout(settings.vision_timeout_seconds):
            return await analyze_image_content(source, "image/jpeg")
    except TimeoutError:
        log.warning(
            "vision analysis timed out after %ss for %s", settings.vision_timeout_seconds, source
        )
        return None


async def _record_analysis(db: AsyncSession, image: Image, vision: VisionResult) -> None:
    """Store what the model saw, replacing any previous reading of this photo.

    `image_id` is the primary key of the table, so adding a row for a photo
    that already had one is a duplicate-key error — which failed the whole
    re-analysis, every time, for every photo that had ever been analyzed.
    """
    existing = await db.get(ImageAnalysis, image.id)
    if existing is None:
        existing = ImageAnalysis(image_id=image.id)
        db.add(existing)
    existing.kind = vision.kind
    existing.caption = vision.caption
    existing.labels = vision.labels
    existing.raw = vision.model_dump(mode="json")
    existing.model = settings.llm_model
    existing.analyzed_at = datetime.now(UTC)


def _readable_error(exc: Exception) -> str:
    """What to put on the row for the user to read.

    `image.error` is rendered verbatim under the photo, and a database error
    stringifies to the whole failed statement — every column, every bound
    parameter, the driver's class path. Nobody can act on a screen of INSERT,
    and it is the wrong thing to hand a phone. The full exception goes to the
    log, where it is diagnosable; this is the sentence that goes on screen.
    """
    if isinstance(exc, SQLAlchemyError):
        return "Could not save what was read from this photo."
    first_line = str(exc).strip().splitlines()[0] if str(exc).strip() else ""
    return first_line[:300] or f"Analysis failed ({type(exc).__name__})."


async def _analysis_allowed(db: AsyncSession, image: Image) -> bool:
    if settings.daily_analysis_cap <= 0:
        return True
    day_start = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
    analyzed_today = await db.scalar(
        sa.select(sa.func.count())
        .select_from(ImageAnalysis)
        .join(Image, Image.id == ImageAnalysis.image_id)
        .where(Image.user_id == image.user_id, ImageAnalysis.analyzed_at >= day_start)
    )
    return (analyzed_today or 0) < settings.daily_analysis_cap


async def run_image_analysis(db: AsyncSession, image_id: int) -> None:
    image = await db.get(Image, image_id)
    if image is None:
        log.warning("analyze: image %s vanished", image_id)
        return
    user = await db.get(User, image.user_id)
    image.status = "processing"
    await db.commit()

    try:
        original = Path(image.original_path)
        data = original.read_bytes()

        await _apply_exif(image, data)

        if not image.thumb_path:
            thumb = await asyncio.to_thread(storage.make_thumbnail, original)
            image.thumb_path = str(thumb)

        vision: VisionResult | None = None
        if await _analysis_allowed(db, image):
            try:
                source = Path(image.thumb_path) if image.thumb_path else original
                vision = await _run_vision(source)
            except Exception:
                log.exception("vision analysis failed for image %s", image_id)

        # Only a fix of its own can be reverse-geocoded, and only a photo the
        # user has not answered for. A place they picked is the answer to this
        # exact question, so re-analysis must not talk over it — pressing
        # "Re-analyze" after correcting a photo would otherwise hand it
        # straight back to the shop next door.
        if image.lat is not None and image.lng is not None and not image.place_pinned:
            hint = vision.kind if vision else None
            place = await resolve_place(db, image.lat, image.lng, hint=hint)
            if place:
                image.place_id = place.id
            elif image.place_id is None:
                log.info("no place resolved for image %s at %s,%s", image_id, image.lat, image.lng)

        if vision:
            await _record_analysis(db, image, vision)
            await _apply_receipt(db, image, vision, user)

        image.status = "analyzed"
        image.error = None
        await db.commit()
    except Exception as exc:
        log.exception("analysis failed for image %s", image_id)
        await db.rollback()
        image = await db.get(Image, image_id)
        if image:
            image.status = "failed"
            image.error = _readable_error(exc)
            await db.commit()
        raise

    await recluster_user(db, user)
