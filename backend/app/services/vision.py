"""Image understanding via the OpenAI Agents SDK.

One agent run per image returns a structured VisionResult: what the photo shows
(place / food / item / receipt / ...), a caption, labels, and — for receipts —
merchant, currency, totals, and line items.

The model is not handed the photo on its own. A `PhotoContext` travels with it
saying when the shutter went and roughly where — the two things a thermal print
is worst at and the phone is best at. Without them a faint `08/07/19` comes
back as 2019 and the money lands seven years down the timeline.

`LLM_MODEL` picks the model; it must be one that can see images. With no key
configured the step is skipped entirely and images are logged by time and
location only.
"""

import base64
import logging
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field

from app.config import settings
from app.services.llm import llm_enabled, prepare_sdk

log = logging.getLogger(__name__)

ImageKind = Literal["place", "food", "item", "receipt", "document", "other"]

# How far from the photograph a printed date may fall before it is treated as a
# misreading rather than a memory. A receipt is photographed at the till or in
# the hotel that evening; the long tail is the shoebox of receipts photographed
# at the end of a trip, which is weeks, not years. Forward is tighter still —
# nothing is bought after it is photographed, bar a till whose clock is a few
# hours out or a date line crossed between the two.
RECEIPT_BACKDATE_LIMIT = timedelta(days=400)
RECEIPT_FUTURE_LIMIT = timedelta(days=2)


@dataclass(slots=True)
class PhotoContext:
    """What the pipeline already knows about a photo before the model sees it.

    Every field is optional because every field can be missing: a screenshot
    has no clock and no fix, and a self-hosted install with no Google key never
    learns a name for anywhere. Whatever is known is described to the model;
    the rest is simply not mentioned, so it is never invited to infer from a
    blank.
    """

    captured_at: datetime | None = None
    # "exif" (the camera's own clock) | "upload" | "receipt" | "custom"
    captured_at_source: str | None = None
    now: datetime | None = None
    lat: float | None = None
    lng: float | None = None
    place_name: str | None = None
    place_address: str | None = None

    def as_prompt(self) -> str:
        """The context block appended to the user turn, or "" if nothing is known."""
        lines: list[str] = []
        if self.captured_at is not None:
            when = self.captured_at.strftime("%Y-%m-%d %H:%M")
            if self.captured_at_source == "exif":
                lines.append(f"- Photographed {when}, by the camera's own clock.")
            else:
                lines.append(
                    f"- The camera recorded no time; the photo reached the log on {when}."
                )
        if self.now is not None:
            lines.append(f"- Today is {self.now.strftime('%Y-%m-%d')}.")
        where = None
        if self.place_name:
            where = self.place_name
            if self.place_address:
                where += f", {self.place_address}"
        if self.lat is not None and self.lng is not None:
            fix = f"{self.lat:.5f}, {self.lng:.5f}"
            lines.append(f"- Taken at {fix}" + (f", by {where}." if where else "."))
        elif where:
            lines.append(f"- Filed under {where}.")
        if not lines:
            return ""
        return "\n".join(["", "Known about this photo, from outside the image:", *lines])


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
items exactly as printed; use the receipt's own numbers, do not invent values.
Read datetime_iso off the receipt as printed: the till's own local clock, with
no timezone conversion and no offset appended. Leave it null rather than guess
— an unreadable date, a date with no year, or a printed date that is not the
moment of purchase (a "valid until", a reprint stamp) is better absent than
wrong.

The message may carry what is already known about the photo — when it was
taken, where it was. That comes from the phone, not from the image, and it is
more dependable than anything a faded thermal print can tell you. Use it:

- A receipt is photographed at the till or within a day or two of it, so the
  purchase date sits beside the photo's own date. Read every ambiguous part of
  the printed date in that light: a two-digit year is the one nearest the
  photograph, and a date that could be day/month or month/day is whichever
  order lands near it.
- If what you read would make the receipt older than the photograph by years,
  you have misread a digit. Read it again; if it still will not resolve, leave
  datetime_iso null. A missing date is repaired in one tap — a receipt filed
  under 2019 is not, because nobody scrolls back that far to find it.
- Never date a purchase later than the photograph of it.
- The location tells you which country this is, which usually settles the
  currency of amounts printed with a bare symbol or a local word.
- The nearby venue is a strong hint for a merchant line that is faint,
  abbreviated to a franchise code, or cut off. Anything legibly printed still
  wins over it: use the venue's name for merchant and place_hint only when the
  receipt does not give you one you can actually read."""


def parse_receipt_datetime(
    value: str | None, reference: datetime | None = None
) -> datetime | None:
    """The time printed on the receipt, as printed, if it can be believed.

    A till prints local time — "10 August 2026 20:35" is 20:35 in the shop —
    which is the frame everything else is kept in, so the clock is taken and
    the zone, if the model volunteered one, is dropped. Honouring it would move
    the receipt away from the photo of the same meal by the whole offset.

    ``reference`` is when the photograph was taken, and a date a long way from
    it is thrown away. A model reading `08/07/19` off a faded print returns
    2019 with every appearance of confidence, and an expense dated seven years
    ago is invisible: it is not on the timeline, not in this month's total, and
    not anywhere the user would think to look. Dropping the line instead leaves
    the expense on the day of the photo, which is a day out at worst.
    """
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return None
    parsed = parsed.replace(tzinfo=UTC)
    if reference is not None:
        anchor = reference if reference.tzinfo else reference.replace(tzinfo=UTC)
        if not (anchor - RECEIPT_BACKDATE_LIMIT <= parsed <= anchor + RECEIPT_FUTURE_LIMIT):
            log.info(
                "discarding printed receipt date %s: %s from the photo taken %s",
                parsed.date(),
                "too long before" if parsed < anchor else "after",
                anchor.date(),
            )
            return None
    return parsed


async def analyze_image_content(
    image_path: Path, mime: str, context: PhotoContext | None = None
) -> VisionResult | None:
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
                    {
                        "type": "input_text",
                        "text": "Analyze this photo." + (context.as_prompt() if context else ""),
                    },
                ],
            }
        ],
    )
    return result.final_output
