from datetime import UTC, datetime

import pytest

from app.services.exif import extract_exif
from tests.util import make_jpeg


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
