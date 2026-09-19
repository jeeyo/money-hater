"""Exported trip pages: render one, and keep it on disk until the trip moves."""

import asyncio
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas import TripDetailOut

from . import cache, photos
from .render import ExportOptions, filename_for, render_page

__all__ = ["ExportOptions", "ExportedPage", "clear_for_trip", "export_page"]

clear_for_trip = cache.clear

# Any non-empty source stands in for a photo while the fingerprint is worked out:
# the fingerprint strips `src="data:…"` before hashing, so the page's identity
# turns on *which* photos are in it, never on the bytes they encoded to.
_PLACEHOLDER = "data:,"


def _variant(options: ExportOptions) -> str:
    """Which of the four pages this is — part of the cache key, not of the
    version, since every variant of a current trip is itself current."""
    photos = "photos" if options.photos else "nophotos"
    spending = "spending" if options.spending else "nospending"
    return f"{photos}-{spending}"


@dataclass(frozen=True)
class ExportedPage:
    path: Path
    filename: str
    fingerprint: str
    #: False when the page had to be built; the photos are what make that slow.
    cached: bool


async def export_page(
    db: AsyncSession,
    user_id: int,
    trip: TripDetailOut,
    options: ExportOptions,
    exported_at: datetime | None = None,
) -> ExportedPage:
    """The trip's page on disk, built only if the trip has changed since the last one.

    The order here is the whole point of the cache. The fingerprint is worked out
    from a render with the photos stubbed out — string work, no image touched —
    and that is enough to name the file the finished page would have. If it is
    already there, nothing else happens: no thumbnails read, no JPEG re-encoded,
    no page built. Only a miss pays for the real render, and it renders twice,
    which is microseconds against a folder of photographs.
    """
    moment = exported_at or datetime.now(UTC)
    thumbs = await photos.thumb_paths(db, user_id, photos.image_ids(trip)) if options.photos else {}

    stub = dict.fromkeys(thumbs, _PLACEHOLDER)
    fingerprint = render_page(trip, options, stub, moment).fingerprint
    path = cache.export_path(user_id, trip.id, _variant(options), fingerprint)
    filename = filename_for(trip)
    if path.is_file():
        return ExportedPage(path=path, filename=filename, fingerprint=fingerprint, cached=True)

    def build() -> Path:
        encoded = photos.collect(thumbs)
        page = render_page(trip, options, encoded, moment)
        return cache.store(user_id, trip.id, _variant(options), page.fingerprint, page.html)

    # PIL and the filesystem, neither of which lets go of the event loop.
    path = await asyncio.to_thread(build)
    return ExportedPage(path=path, filename=filename, fingerprint=fingerprint, cached=False)
