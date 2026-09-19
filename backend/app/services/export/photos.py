"""Photos for an exported page, as data URIs.

`/api/images/{id}/thumb` is behind the session cookie, so a plain `<img
src="/api/…">` in a file someone mails to a friend is a broken icon. The bytes
have to travel with the page.

Re-encoding is what keeps the file sendable. Stored thumbnails are 512px JPEG at
quality 82 (`app.services.storage`); at quality 72 they lose roughly a third of
their weight at a size nobody looks closely at, and base64 adds that third
straight back.
"""

import base64
import io
from pathlib import Path

import sqlalchemy as sa
from PIL import Image as PILImage
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Image
from app.schemas import TripDetailOut

# Never larger than the stored thumbnail, so the page's tap-to-enlarge shows a
# real photo rather than an upscale of a smaller one.
PHOTO_MAX = 512
PHOTO_QUALITY = 72


def _encode(path: Path) -> str | None:
    """One unreadable photo is not worth failing an export over: the page goes
    out without it and the rest of the trip is intact."""
    try:
        with PILImage.open(path) as image:
            image = image.convert("RGB")
            image.thumbnail((PHOTO_MAX, PHOTO_MAX))
            buffer = io.BytesIO()
            image.save(buffer, "JPEG", quality=PHOTO_QUALITY)
    except OSError:
        return None
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/jpeg;base64,{encoded}"


def image_ids(trip: TripDetailOut) -> list[int]:
    """Every photo the page would show, in the order it shows them."""
    return [image.id for day in trip.days for visit in day.visits for image in visit.images]


def collect(thumbs: dict[int, str]) -> dict[int, str]:
    """Blocking: PIL and file reads. Call it off the event loop."""
    encoded = {}
    for image_id, path in thumbs.items():
        uri = _encode(Path(path))
        if uri:
            encoded[image_id] = uri
    return encoded


async def thumb_paths(db: AsyncSession, user_id: int, ids: list[int]) -> dict[int, str]:
    """Where each photo's thumbnail sits on disk.

    Read straight off the filesystem rather than back through the API the
    frontend would have had to use: no round trip, no re-authentication, and the
    originals are already beside the thumbnails if one is ever missing.
    """
    if not ids:
        return {}
    rows = await db.execute(
        sa.select(Image.id, Image.thumb_path).where(
            Image.id.in_(ids), Image.user_id == user_id, Image.thumb_path.is_not(None)
        )
    )
    found = {row.id: row.thumb_path for row in rows}
    # Back in the order the page shows them, so a trip's photos are encoded in
    # reading order and a truncated export is truncated from the end.
    return {image_id: found[image_id] for image_id in ids if image_id in found}
