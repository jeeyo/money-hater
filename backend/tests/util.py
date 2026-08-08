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


def make_jpeg(
    lat: float | None = None,
    lng: float | None = None,
    taken_at: datetime | None = None,
    color=(200, 60, 60),
    size=(64, 64),
) -> bytes:
    exif_dict: dict = {"0th": {}, "Exif": {}, "GPS": {}}
    if taken_at is not None:
        stamp = taken_at.strftime("%Y:%m:%d %H:%M:%S")
        exif_dict["Exif"][piexif.ExifIFD.DateTimeOriginal] = stamp
    if lat is not None and lng is not None:
        exif_dict["GPS"][piexif.GPSIFD.GPSLatitudeRef] = "N" if lat >= 0 else "S"
        exif_dict["GPS"][piexif.GPSIFD.GPSLatitude] = _dms(lat)
        exif_dict["GPS"][piexif.GPSIFD.GPSLongitudeRef] = "E" if lng >= 0 else "W"
        exif_dict["GPS"][piexif.GPSIFD.GPSLongitude] = _dms(lng)
    exif_bytes = piexif.dump(exif_dict)
    buffer = io.BytesIO()
    PILImage.new("RGB", size, color).save(buffer, "JPEG", exif=exif_bytes)
    return buffer.getvalue()
