"""Image understanding via the OpenAI Agents SDK.

One agent run per image returns a structured VisionResult: what the photo shows
(place / food / item / receipt / ...), a caption, labels, and — for receipts —
merchant, currency, totals, and line items.

`LLM_MODEL` picks the model; it must be one that can see images. With no key
configured the step is skipped entirely and images are logged by time and
location only.
"""

import base64
import logging
from datetime import UTC, datetime
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field

from app.config import settings
from app.services.llm import llm_enabled, prepare_sdk

log = logging.getLogger(__name__)

ImageKind = Literal["place", "food", "item", "receipt", "document", "other"]


class ReceiptItem(BaseModel):
    name: str
    qty: float = 1.0
    unit_price: float | None = None
    amount: float


class ReceiptData(BaseModel):
    merchant: str | None = None
    datetime_iso: str | None = Field(
        default=None,
        description="Purchase date/time printed on the receipt, ISO 8601, if legible",
    )
    currency: str | None = Field(
        default=None,
        description="ISO 4217 code of the printed amounts, e.g. THB, JPY, USD",
    )
    total: float | None = None
    tax: float | None = None
    tip: float | None = None
    items: list[ReceiptItem] = []


class VisionResult(BaseModel):
    kind: ImageKind
    caption: str = Field(description="One short sentence describing the photo")
    labels: list[str] = Field(description="3-8 lowercase tags, e.g. ramen, restaurant, night")
    place_hint: str | None = Field(
        default=None,
        description="Venue name if visible in the photo (sign, menu, storefront)",
    )
    receipt: ReceiptData | None = Field(
        default=None, description="Only when kind == 'receipt': the parsed receipt"
    )


INSTRUCTIONS = """You analyze a single photo from someone's personal trip log.

Classify what it mainly shows:
- place: scenery, buildings, streets, interiors, landmarks
- food: dishes, drinks, meals
- item: a product or object (souvenir, purchase, gadget)
- receipt: a purchase receipt, bill, or invoice
- document: tickets, boarding passes, menus, signs photographed for reference
- other: anything else (people, pets, screenshots, ...)

Always produce a short caption and a few lowercase labels.
If a venue or shop name is readable in the image, set place_hint.
If it is a receipt, extract merchant, currency (ISO 4217), totals, and line
items exactly as printed; use the receipt's own numbers, do not invent values."""


def parse_receipt_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)


async def analyze_image_content(image_path: Path, mime: str) -> VisionResult | None:
    if not llm_enabled():
        return None
    # Imported lazily so the app runs without a key (and tests never touch it)
    from agents import Agent, Runner

    prepare_sdk()

    data_url = f"data:{mime};base64,{base64.b64encode(image_path.read_bytes()).decode()}"
    agent = Agent(
        name="image-analyst",
        instructions=INSTRUCTIONS,
        model=settings.llm_model,
        output_type=VisionResult,
    )
    result = await Runner.run(
        agent,
        input=[
            {
                "role": "user",
                "content": [
                    {"type": "input_image", "image_url": data_url},
                    {"type": "input_text", "text": "Analyze this photo."},
                ],
            }
        ],
    )
    return result.final_output
