"""The per-image analysis pipeline run by the worker.

Stages: EXIF -> thumbnail -> place resolution -> vision -> expense -> recluster.
Each stage degrades gracefully (no GPS, no API keys, unreadable receipt) so an
upload always ends in 'analyzed' unless something truly unexpected happens.
"""

import asyncio
import logging
from datetime import UTC, datetime
from pathlib import Path

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import ExpenseItem, Image, ImageAnalysis, User
from app.services import storage
from app.services.clustering import recluster_user
from app.services.exif import extract_exif
from app.services.expenses import create_expense
from app.services.money import to_minor
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
        image.taken_at = exif.taken_at
        image.taken_at_source = "exif"
    else:
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
    currency = (receipt.currency or user.preferred_currency).upper()
    spent_at = parse_receipt_datetime(receipt.datetime_iso)
    expense = await create_expense(
        db,
        user,
        image_id=image.id,
        source="receipt",
        merchant=receipt.merchant,
        # The photo's own GPS already told us where this was
        place_id=image.place_id,
        spent_at=spent_at or image.taken_at,
        currency=currency,
        total_minor=to_minor(receipt.total, currency) or 0,
        tax_minor=to_minor(receipt.tax, currency),
        tip_minor=to_minor(receipt.tip, currency),
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
                vision = await analyze_image_content(source, "image/jpeg")
            except Exception:
                log.exception("vision analysis failed for image %s", image_id)

        if image.lat is not None:
            hint = vision.kind if vision else None
            place = await resolve_place(db, image.lat, image.lng, hint=hint)
            if place:
                image.place_id = place.id

        if vision:
            db.add(
                ImageAnalysis(
                    image_id=image.id,
                    kind=vision.kind,
                    caption=vision.caption,
                    labels=vision.labels,
                    raw=vision.model_dump(mode="json"),
                    model=settings.openai_vision_model,
                )
            )
            await _apply_receipt(db, image, vision, user)

        image.status = "analyzed"
        image.error = None
        await db.commit()
    except Exception as exc:
        await db.rollback()
        image = await db.get(Image, image_id)
        if image:
            image.status = "failed"
            image.error = str(exc)[:1000]
            await db.commit()
        raise

    await recluster_user(db, user)
