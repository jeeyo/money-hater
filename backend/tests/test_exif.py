import math
from datetime import UTC, datetime

import pytest
import sqlalchemy as sa

from app.models import Image
from app.services.exif import extract_exif
from tests.conftest import register
from tests.util import NO_FIX_DMS, make_jpeg


def test_extract_full_exif():
    taken = datetime(2026, 8, 8, 12, 30, 15)
    data = make_jpeg(lat=13.7563, lng=100.5018, taken_at=taken)
    exif = extract_exif(data)
    assert exif.taken_at == taken.replace(tzinfo=UTC)
    assert exif.lat == pytest.approx(13.7563, abs=1e-4)
    assert exif.lng == pytest.approx(100.5018, abs=1e-4)


def test_extract_southern_western_hemisphere():
    data = make_jpeg(lat=-33.8688, lng=-70.6693)
    exif = extract_exif(data)
    assert exif.lat == pytest.approx(-33.8688, abs=1e-4)
    assert exif.lng == pytest.approx(-70.6693, abs=1e-4)


def test_extract_no_exif():
    data = make_jpeg()
    exif = extract_exif(data)
    assert exif.taken_at is None
    assert exif.lat is None and exif.lng is None


def test_extract_garbage_bytes():
    exif = extract_exif(b"definitely not an image")
    assert exif.taken_at is None
    assert exif.raw == {}


def test_gps_tags_that_never_got_a_fix_are_no_location():
    """Zero-denominator rationals read back as NaN, not as a coordinate.

    NaN used to pass every "do we have a location?" check and then fail far
    downstream, where it cannot be encoded as JSON — the photo was accepted at
    upload and died in the worker with a message about float values.
    """
    data = make_jpeg(gps_dms=(NO_FIX_DMS, NO_FIX_DMS), taken_at=datetime(2026, 8, 8, 12, 0))
    exif = extract_exif(data)
    assert exif.lat is None and exif.lng is None
    assert exif.taken_at is not None, "a broken GPS tag must not cost us the timestamp"


def test_out_of_range_coordinates_are_dropped():
    data = make_jpeg(gps_dms=([(200, 1), (0, 1), (0, 1)], [(10, 1), (0, 1), (0, 1)]))
    exif = extract_exif(data)
    assert exif.lat is None and exif.lng is None, "half a fix is not a fix"


def _finite(value) -> bool:
    if isinstance(value, float):
        return math.isfinite(value)
    if isinstance(value, dict):
        return all(_finite(v) for v in value.values())
    if isinstance(value, list):
        return all(_finite(v) for v in value)
    return True


def test_raw_exif_holds_nothing_json_cannot_carry():
    """`raw` goes into a JSON column, so a NaN in it would fail the insert."""
    data = make_jpeg(*(13.7563, 100.5018), taken_at=datetime(2026, 8, 8, 12, 0))
    exif = extract_exif(data)
    assert _finite(exif.raw)


def test_raw_exif_records_the_gps_tags_as_written():
    data = make_jpeg(lat=13.7563, lng=100.5018)
    gps = extract_exif(data).raw["GPS"]
    assert gps["GPSLatitudeRef"] == "N"
    assert gps["GPSLongitudeRef"] == "E"
    assert gps["GPSLatitude"][0] == 13
    assert gps["GPSLongitude"][0] == 100


def test_a_rejected_fix_still_leaves_its_tags_behind():
    """The reason this is recorded at all.

    A photo that reached us with unusable GPS and one that reached us with
    none at all both end up with no coordinates, and only the stored tags say
    which happened — the difference between a bug in here and a phone, a
    gallery or a share sheet that stripped the location on the way out.
    """
    data = make_jpeg(gps_dms=(NO_FIX_DMS, NO_FIX_DMS))
    exif = extract_exif(data)
    assert exif.lat is None and exif.lng is None
    assert "GPS" in exif.raw, "a fix we threw away must still be on the record"
    assert exif.raw["GPS"]["GPSLatitudeRef"] == "N"
    assert _finite(exif.raw)


def test_a_photo_with_no_gps_has_no_gps_block():
    """The other half of the signal: absent means the file really had none."""
    exif = extract_exif(make_jpeg(taken_at=datetime(2026, 8, 8, 12, 0)))
    assert "GPS" not in exif.raw


def test_the_ifd_pointers_are_not_kept():
    """`GPSInfo` is a byte offset that reads like a location. It is not one."""
    raw = extract_exif(make_jpeg(lat=13.7563, lng=100.5018)).raw
    assert "GPSInfo" not in raw and "ExifOffset" not in raw


async def test_an_upload_keeps_the_gps_tags_on_the_row(client, db_sessionmaker):
    """The tags are only useful if they survive to somewhere answerable.

    Reading `images.exif` is how "did this photo arrive with a location?" gets
    settled after the fact, so the trip from the uploaded bytes to the column
    is worth holding still.
    """
    await register(client)
    response = await client.post(
        "/api/images",
        files=[("files", ("a.jpg", make_jpeg(13.7563, 100.5018), "image/jpeg"))],
    )
    assert response.status_code == 201, response.text

    async with db_sessionmaker() as db:
        image = await db.scalar(sa.select(Image))
    assert image.lat == pytest.approx(13.7563, abs=1e-4)
    assert image.exif["GPS"]["GPSLatitudeRef"] == "N"
