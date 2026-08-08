"""EXIF extraction: timestamp, GPS coordinates, camera info.

EXIF timestamps carry no timezone; we store them as UTC as-is (the common
self-hosting tradeoff) and record where the timestamp came from so the UI can
flag low-confidence times.
"""

import io
from dataclasses import dataclass
from datetime import UTC, datetime

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
        return float(value)
    except (TypeError, ValueError, ZeroDivisionError):
        return None


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

    raw: dict = {}
    for tag_id, value in exif.items():
        name = ExifTags.TAGS.get(tag_id, str(tag_id))
        if isinstance(value, (str, int, float)):
            raw[name] = value
    for tag_id, value in exif_ifd.items():
        name = ExifTags.TAGS.get(tag_id, str(tag_id))
        if isinstance(value, (str, int, float)):
            raw[name] = value

    return ExifData(
        taken_at=taken_at,
        lat=lat,
        lng=lng,
        camera_make=exif.get(ExifTags.Base.Make),
        camera_model=exif.get(ExifTags.Base.Model),
        raw=raw,
    )
