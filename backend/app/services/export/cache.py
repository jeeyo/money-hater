"""The exported pages kept on disk.

A trip changes, so a page built from it goes stale — and there is no cheap way to
ask a file on disk whether it still matches, short of reading it back and picking
the fingerprint out of its head. So the fingerprint is the filename here:

    {media_root}/{user_id}/exports/{trip_id}-{variant}-{fingerprint}.html

Checking the cache is then a `stat`, not a read. A stale entry is a *different*
path rather than a wrong one, so nothing ever has to be invalidated — the new
page simply lands beside it, and the old ones are swept when it does. What the
recipient downloads is named after the trip alone; that name is set on the
response, and has nothing to do with the name on disk.

The variant is in there because an itinerary-only page and a full one are both
current: swept by trip alone they would evict each other on every other export,
which is the one access pattern a cache has to survive. It is spelled out rather
than encoded — a directory of these is something a person ends up reading.
"""

import os
from pathlib import Path

from app.config import settings


def export_dir(user_id: int) -> Path:
    return settings.media_root / str(user_id) / "exports"


def export_path(user_id: int, trip_id: int, variant: str, fingerprint: str) -> Path:
    return export_dir(user_id) / f"{trip_id}-{variant}-{fingerprint}.html"


def store(user_id: int, trip_id: int, variant: str, fingerprint: str, html: str) -> Path:
    """Write the page, then drop every older page for the same trip.

    Written to a temporary name and moved into place: a reader that finds the
    path must find a whole file, and two requests racing on the same trip would
    otherwise interleave their bytes. `os.replace` is atomic within a filesystem,
    and the temporary sits in the same directory to stay on one.
    """
    path = export_path(user_id, trip_id, variant, fingerprint)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{os.getpid()}")
    temporary.write_text(html, encoding="utf-8")
    os.replace(temporary, path)
    sweep(user_id, trip_id, variant, keep=path)
    return path


def sweep(user_id: int, trip_id: int, variant: str, keep: Path) -> None:
    """Every version of this variant but the current one. There is one current
    page per variant; the rest are pages nobody can ask for any more, since
    asking means naming a fingerprint and the only fingerprint anyone can compute
    is today's."""
    for stale in export_dir(user_id).glob(f"{trip_id}-{variant}-*.html"):
        if stale != keep:
            stale.unlink(missing_ok=True)


def clear(user_id: int, trip_id: int) -> None:
    """Drop a trip's pages outright — it was deleted, or its photos were."""
    directory = export_dir(user_id)
    if directory.is_dir():
        for path in directory.glob(f"{trip_id}-*.html"):
            path.unlink(missing_ok=True)
