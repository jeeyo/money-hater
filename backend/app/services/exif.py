"""EXIF extraction: timestamp, GPS coordinates, camera info.

`DateTimeOriginal` is a wall clock with no zone attached — 17:20 means 17:20 on
whatever wall the camera was looking at. Everything downstream wants a real
instant: the timeline buckets days by the viewer's UTC offset and the UI renders
times in the viewer's zone, so a wall clock stamped UTC and left there comes out
shifted by the viewer's whole offset. A receipt from Tuesday afternoon in
Singapore filed itself on Wednesday just after midnight.

So the zone is recovered where the photo carries it, in the order it can be
trusted: the EXIF offset tags a modern phone writes beside the timestamp, then
the GPS clock, which is UTC by definition and so gives away the offset when
compared with the wall clock. Only when the photo says neither is the old
assumption kept — the wall clock read as UTC, because nothing in the file can
say otherwise. `ExifData.tz_offset_minutes` records which of the three happened.
"""

import io
import math
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta, timezone
from numbers import Rational

from PIL import ExifTags
from PIL import Image as PILImage

# Real UTC offsets run -12:00..+14:00, and every one in use is a multiple of a
# quarter hour. Anything outside that is a misread, not a timezone.
MAX_OFFSET_MINUTES = 14 * 60
OFFSET_STEP_MINUTES = 15


@dataclass
class ExifData:
    taken_at: datetime | None
    lat: float | None
    lng: float | None
    camera_make: str | None
    camera_model: str | None
    raw: dict
    # Minutes east of UTC, as the photo gave it up; None when it never did and
    # `taken_at` is a wall clock being read as UTC for want of anything better.
    tz_offset_minutes: int | None = None


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


def _text(value: str) -> str | None:
    """EXIF text a JSON column can actually hold, or None if nothing is left.

    NUL is the sharp edge. Postgres rejects \\u0000 anywhere in a JSONB
    document, and EXIF is full of it: fixed-width ASCII fields are padded with
    it, and a tag the phone never filled in is *nothing but* it. `str.strip()`
    does not touch it — it strips whitespace — so a GPSDateStamp of ten NULs
    read as a perfectly ordinary non-empty string right up until the insert,
    which then failed for the whole photo rather than for the one tag.

    Lone surrogates come back from Pillow the same way and are equally
    unstorable, so the text is round-tripped through UTF-8 to flush them out.
    """
    cleaned = value.replace("\x00", "").strip()
    return cleaned.encode("utf-8", "replace").decode("utf-8") or None


def _json_safe(value):
    """An EXIF value a JSON column can hold, or None to skip the tag.

    NaN and the infinities are floats that json.dumps refuses, and `raw` is
    written straight into a JSON column — one of them would fail the whole row.
    """
    if isinstance(value, float):
        return value if math.isfinite(value) else None
    if isinstance(value, str):
        return _text(value)
    return value if isinstance(value, int) else None


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
        # All-NUL is padding for a tag the phone left empty, not twelve zeroes
        # worth recording.
        if not any(value):
            return None
        # Most GPS tags are ASCII ("N", "2026:08:03"), but a few are binary —
        # GPSVersionID is four raw bytes. Reading those as characters produces
        # control-code noise, so anything unprintable stays numeric.
        text = _text(value.decode("ascii", "replace"))
        return text if text and text.isprintable() else list(value)
    if isinstance(value, str):
        return _text(value)
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
    """The wall clock a timestamp tag holds, with no zone read into it yet."""
    if not value:
        return None
    for fmt in ("%Y:%m:%d %H:%M:%S", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(value.strip(), fmt)
        except ValueError:
            continue
    return None


def _parse_offset(value) -> int | None:
    """Minutes east of UTC from an EXIF offset tag: "+08:00", "-0500", "Z".

    The tag exists precisely because the timestamp beside it has no zone, and a
    phone that has been abroad writes it. Its unset form is spaces or NULs,
    which `_text` has already turned into nothing.
    """
    if isinstance(value, bytes):
        value = value.decode("ascii", "replace")
    if not isinstance(value, str):
        return None
    text = _text(value)
    if not text:
        return None
    if text in ("Z", "z"):
        return 0
    sign = {"+": 1, "-": -1}.get(text[0])
    if sign is None:
        return None
    digits = text[1:].replace(":", "")
    if len(digits) != 4 or not digits.isdigit():
        return None
    hours, minutes = int(digits[:2]), int(digits[2:])
    if minutes > 59:
        return None
    offset = sign * (hours * 60 + minutes)
    return offset if abs(offset) <= MAX_OFFSET_MINUTES else None


def _gps_utc(gps_ifd) -> datetime | None:
    """The moment the GPS fix was taken, which the spec pins to UTC.

    `GPSDateStamp` is "YYYY:MM:DD" and `GPSTimeStamp` is three rationals. Both
    have to be there: the time alone cannot say which day it belongs to, and
    guessing costs a whole day either side of midnight.
    """
    stamp = gps_ifd.get(ExifTags.GPS.GPSDateStamp)
    clock = gps_ifd.get(ExifTags.GPS.GPSTimeStamp)
    if isinstance(stamp, bytes):
        stamp = stamp.decode("ascii", "replace")
    if not isinstance(stamp, str) or not clock or len(clock) != 3:
        return None
    day = _text(stamp)
    if not day:
        return None
    parts = [_to_float(value) for value in clock]
    if any(part is None for part in parts):
        return None
    for fmt in ("%Y:%m:%d", "%Y-%m-%d"):
        try:
            parsed = datetime.strptime(day, fmt)
        except ValueError:
            continue
        seconds = parts[0] * 3600 + parts[1] * 60 + parts[2]
        if not 0 <= seconds < 24 * 3600:
            return None
        return (parsed + timedelta(seconds=seconds)).replace(tzinfo=UTC)
    return None


def _offset_from_gps(wall_clock: datetime, gps_utc: datetime | None) -> int | None:
    """The offset implied by a local wall clock and the UTC clock beside it.

    Two readings of the same moment, one zoned and one not, is all a UTC offset
    is. Rounded to the quarter hour because the two are seconds apart at best —
    the fix is not taken at the instant the shutter is — and no zone is finer
    than that anyway.
    """
    if gps_utc is None:
        return None
    drift = (wall_clock.replace(tzinfo=UTC) - gps_utc).total_seconds() / 60
    offset = round(drift / OFFSET_STEP_MINUTES) * OFFSET_STEP_MINUTES
    return offset if abs(offset) <= MAX_OFFSET_MINUTES else None


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

    # Each timestamp has its own offset tag; taking the first timestamp that
    # reads means taking the offset written for that one, not for its neighbour.
    wall_clock = offset = None
    for stamp, zone in (
        (exif_ifd.get(ExifTags.Base.DateTimeOriginal), ExifTags.Base.OffsetTimeOriginal),
        (exif_ifd.get(ExifTags.Base.DateTimeDigitized), ExifTags.Base.OffsetTimeDigitized),
        (exif.get(ExifTags.Base.DateTime), ExifTags.Base.OffsetTime),
    ):
        wall_clock = _parse_exif_datetime(stamp)
        if wall_clock is not None:
            offset = _parse_offset(exif_ifd.get(zone) or exif.get(zone))
            break

    if wall_clock is None:
        taken_at = None
    else:
        if offset is None:
            offset = _offset_from_gps(wall_clock, _gps_utc(gps_ifd))
        # No offset from either source leaves the wall clock read as UTC. It is
        # the wrong instant anywhere east or west of Greenwich, but it is the
        # only reading the file supports, and the time of day it shows is at
        # least the time of day on the camera.
        taken_at = wall_clock.replace(tzinfo=timezone(timedelta(minutes=offset or 0))).astimezone(
            UTC
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
        tz_offset_minutes=offset,
    )
