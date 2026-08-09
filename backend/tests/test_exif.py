import math
from datetime import UTC, datetime

import pytest

from app.services.exif import extract_exif
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


def test_raw_exif_holds_nothing_json_cannot_carry():
    """`raw` goes into a JSON column, so a NaN in it would fail the insert."""
    data = make_jpeg(*(13.7563, 100.5018), taken_at=datetime(2026, 8, 8, 12, 0))
    exif = extract_exif(data)
    assert all(
        not (isinstance(v, float) and not math.isfinite(v)) for v in exif.raw.values()
    )
