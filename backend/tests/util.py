import io
from datetime import datetime
from fractions import Fraction

import piexif
from PIL import Image as PILImage


def _dms(value: float) -> list[tuple[int, int]]:
    value = abs(value)
    degrees = int(value)
    minutes = int((value - degrees) * 60)
    seconds = Fraction((value - degrees - minutes / 60) * 3600).limit_denominator(100)
    return [(degrees, 1), (minutes, 1), (seconds.numerator, seconds.denominator)]


# A rational with a zero denominator is what a phone writes into the GPS tags
# when the fix never arrived. Pillow reads it back as NaN rather than raising.
NO_FIX_DMS = [(0, 0), (0, 0), (0, 0)]


def make_jpeg(
    lat: float | None = None,
    lng: float | None = None,
    taken_at: datetime | None = None,
    color=(200, 60, 60),
    size=(64, 64),
    gps_dms: tuple[list, list] | None = None,
    gps_extra: dict | None = None,
    offset: str | None = None,
    gps_utc: datetime | None = None,
) -> bytes:
    """A JPEG with the EXIF a phone would have written.

    `taken_at` is written as the wall clock it shows — the tag carries no zone,
    which is the whole difficulty. `offset` is the companion tag a modern phone
    writes beside it ("+08:00"), and `gps_utc` is the GPS clock, which the spec
    pins to UTC; either one is enough to place the wall clock on the map of
    real instants.

    `gps_dms` writes the degree/minute/second rationals verbatim, for the
    malformed GPS tags that `lat`/`lng` could never produce. `gps_extra` adds
    tags beside the coordinates — the padding and empty fields a real camera
    puts there, which are where the awkward values live.
    """
    exif_dict: dict = {"0th": {}, "Exif": {}, "GPS": {}}
    if taken_at is not None:
        stamp = taken_at.strftime("%Y:%m:%d %H:%M:%S")
        exif_dict["Exif"][piexif.ExifIFD.DateTimeOriginal] = stamp
    if offset is not None:
        exif_dict["Exif"][piexif.ExifIFD.OffsetTimeOriginal] = offset
    if gps_utc is not None:
        exif_dict["GPS"][piexif.GPSIFD.GPSDateStamp] = gps_utc.strftime("%Y:%m:%d")
        exif_dict["GPS"][piexif.GPSIFD.GPSTimeStamp] = [
            (gps_utc.hour, 1),
            (gps_utc.minute, 1),
            (gps_utc.second, 1),
        ]
    if gps_dms is not None:
        lat_dms, lng_dms = gps_dms
        exif_dict["GPS"][piexif.GPSIFD.GPSLatitudeRef] = "N"
        exif_dict["GPS"][piexif.GPSIFD.GPSLatitude] = lat_dms
        exif_dict["GPS"][piexif.GPSIFD.GPSLongitudeRef] = "E"
        exif_dict["GPS"][piexif.GPSIFD.GPSLongitude] = lng_dms
    elif lat is not None and lng is not None:
        exif_dict["GPS"][piexif.GPSIFD.GPSLatitudeRef] = "N" if lat >= 0 else "S"
        exif_dict["GPS"][piexif.GPSIFD.GPSLatitude] = _dms(lat)
        exif_dict["GPS"][piexif.GPSIFD.GPSLongitudeRef] = "E" if lng >= 0 else "W"
        exif_dict["GPS"][piexif.GPSIFD.GPSLongitude] = _dms(lng)
    if gps_extra:
        exif_dict["GPS"].update(gps_extra)
    exif_bytes = piexif.dump(exif_dict)
    buffer = io.BytesIO()
    PILImage.new("RGB", size, color).save(buffer, "JPEG", exif=exif_bytes)
    return buffer.getvalue()
