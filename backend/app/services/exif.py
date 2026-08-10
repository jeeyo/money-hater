"""EXIF extraction: timestamp, GPS coordinates, camera info.

EXIF timestamps carry no timezone; we store them as UTC as-is (the common
self-hosting tradeoff) and record where the timestamp came from so the UI can
flag low-confidence times.
"""

import io
import math
from dataclasses import dataclass
from datetime import UTC, datetime
from numbers import Rational

from PIL import ExifTags
from PIL import Image as PILImage


@dataclass
class ExifData:
    taken_at: datetime | None
    lat: float | None
    lng: float | None
    camera_make: str | None
    camera_model: str | None
    raw: dict


def _to_float(value) -> float | None:
    try:
        result = float(value)
    except (TypeError, ValueError, ZeroDivisionError):
        return None
    # Pillow turns a rational with a zero denominator — what a phone writes when
    # the GPS never got a fix — into NaN instead of raising. A NaN coordinate is
    # worse than a missing one: it survives every "do we have a location?" check
    # and then fails much later, where NaN cannot be encoded as JSON (the Places
    # request, the API response). Treat it as absent right here.
    return result if math.isfinite(result) else None


def _dms_to_degrees(dms, ref: str | None) -> float | None:
    if not dms or len(dms) != 3:
        return None
    parts = [_to_float(v) for v in dms]
    if any(p is None for p in parts):
        return None
    degrees = parts[0] + parts[1] / 60 + parts[2] / 3600
    if ref in ("S", "W"):
        degrees = -degrees
    return round(degrees, 7)


def _valid_coords(lat: float | None, lng: float | None) -> tuple[float | None, float | None]:
    """A half-read or out-of-range fix is no fix at all — drop both halves."""
    if lat is None or lng is None:
        return None, None
    if not (-90.0 <= lat <= 90.0) or not (-180.0 <= lng <= 180.0):
        return None, None
    return lat, lng


def _json_safe(value):
    """An EXIF value a JSON column can hold, or None to skip the tag.

    NaN and the infinities are floats that json.dumps refuses, and `raw` is
    written straight into a JSON column — one of them would fail the whole row.
    """
    if isinstance(value, float):
        return value if math.isfinite(value) else None
    return value if isinstance(value, (int, str)) else None


def _gps_value(value):
    """A GPS tag as something a JSON column can hold.

    Deliberately wider than `_json_safe`: coordinates are tuples of rationals
    and the refs are byte strings, none of which survive the conservative rule
    the other IFDs use. Taking the whole GPS IFD is safe where taking a whole
    Exif IFD would not be — it is a dozen small tags, with no MakerNote in it
    to run away with the row.

    A component that cannot be read becomes null rather than dropping the tag,
    so "the fix was there and unusable" still reads differently from "there
    was no fix".
    """
    if isinstance(value, bytes):
        # Most GPS tags are ASCII ("N", "2026:08:03"), but a few are binary —
        # GPSVersionID is four raw bytes. Reading those as characters produces
        # control-code noise, so anything unprintable stays numeric.
        text = value.decode("ascii", "replace").replace("\x00", "").strip()
        if text and text.isprintable():
            return text
        return list(value) or None
    if isinstance(value, str):
        return value.strip() or None
    if isinstance(value, (tuple, list)):
        return [_gps_value(item) for item in value]
    if isinstance(value, int):  # GPSAltitudeRef and friends are small ints
        return value
    if isinstance(value, (float, Rational)):
        return _to_float(value)
    return None


def _gps_raw(gps_ifd) -> dict:
    """The GPS IFD as it was written, named and JSON-safe.

    Kept whether or not the fix survived `_valid_coords`, because telling a
    photo that arrived without GPS from one whose GPS we rejected is the whole
    point of recording it.
    """
    raw = {}
    for tag_id, value in gps_ifd.items():
        safe = _gps_value(value)
        if safe is not None:
            raw[ExifTags.GPSTAGS.get(tag_id, str(tag_id))] = safe
    return raw


def _parse_exif_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    for fmt in ("%Y:%m:%d %H:%M:%S", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(value.strip(), fmt).replace(tzinfo=UTC)
        except ValueError:
            continue
    return None


def extract_exif(data: bytes) -> ExifData:
    empty = ExifData(None, None, None, None, None, {})
    try:
        with PILImage.open(io.BytesIO(data)) as im:
            exif = im.getexif()
            if not exif:
                return empty
            exif_ifd = exif.get_ifd(ExifTags.IFD.Exif)
            gps_ifd = exif.get_ifd(ExifTags.IFD.GPSInfo)
    except Exception:
        return empty

    taken_at = _parse_exif_datetime(
        exif_ifd.get(ExifTags.Base.DateTimeOriginal)
        or exif_ifd.get(ExifTags.Base.DateTimeDigitized)
        or exif.get(ExifTags.Base.DateTime)
    )

    lat = _dms_to_degrees(
        gps_ifd.get(ExifTags.GPS.GPSLatitude), gps_ifd.get(ExifTags.GPS.GPSLatitudeRef)
    )
    lng = _dms_to_degrees(
        gps_ifd.get(ExifTags.GPS.GPSLongitude), gps_ifd.get(ExifTags.GPS.GPSLongitudeRef)
    )
    lat, lng = _valid_coords(lat, lng)

    raw: dict = {}
    for tag_id, value in list(exif.items()) + list(exif_ifd.items()):
        name = ExifTags.TAGS.get(tag_id, str(tag_id))
        safe = _json_safe(value)
        if safe is not None:
            raw[name] = safe

    # The IFD pointers are byte offsets into the file, not data. `GPSInfo` in
    # particular is an integer that reads like a location and is not one — the
    # exact confusion the block below exists to end.
    for pointer in ("ExifOffset", "GPSInfo"):
        raw.pop(pointer, None)
    gps = _gps_raw(gps_ifd)
    if gps:
        raw["GPS"] = gps

    return ExifData(
        taken_at=taken_at,
        lat=lat,
        lng=lng,
        camera_make=exif.get(ExifTags.Base.Make),
        camera_model=exif.get(ExifTags.Base.Model),
        raw=raw,
    )
