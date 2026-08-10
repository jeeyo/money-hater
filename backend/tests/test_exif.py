import math
from datetime import UTC, datetime

import piexif
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


def _nul_free(value) -> bool:
    if isinstance(value, str):
        return "\x00" not in value
    if isinstance(value, dict):
        return all(isinstance(k, str) and "\x00" not in k for k in value) and all(
            _nul_free(v) for v in value.values()
        )
    if isinstance(value, list):
        return all(_nul_free(item) for item in value)
    return True


def test_empty_gps_tags_never_reach_the_column_as_nul():
    """Postgres refuses \\u0000 anywhere in a JSONB document.

    An OPPO Find N5 writes GPSDateStamp as ten NULs and GPSProcessingMethod as
    twelve when it has nothing to put there. Those are strings and bytes that
    look non-empty to Python, and storing one failed the insert for the entire
    photo — which also blocked re-uploading it, since the upload writes the
    same column. Sqlite takes NUL happily, so this asserts on the value rather
    than on a round trip that would pass here and fail in production.
    """
    data = make_jpeg(
        lat=13.7563,
        lng=100.5018,
        gps_extra={
            piexif.GPSIFD.GPSDateStamp: b"\x00" * 10,
            piexif.GPSIFD.GPSProcessingMethod: b"\x00" * 12,
        },
    )
    raw = extract_exif(data).raw
    assert _nul_free(raw), raw
    gps = raw["GPS"]
    assert "GPSDateStamp" not in gps, "an all-NUL tag holds nothing worth keeping"
    assert "GPSProcessingMethod" not in gps
    assert gps["GPSLatitudeRef"] == "N", "the tags that did carry something survive"


def test_padded_text_tags_keep_their_content():
    """NUL padding is stripped without taking the value with it."""
    data = make_jpeg(lat=13.7563, lng=100.5018, gps_extra={
        piexif.GPSIFD.GPSDateStamp: b"2026:08:02\x00",
    })
    assert extract_exif(data).raw["GPS"]["GPSDateStamp"] == "2026:08:02"


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


class TestTheZoneAWallClockWasWrittenIn:
    """`DateTimeOriginal` is a wall clock. Reading it as UTC moves the photo.

    The timeline buckets days by the viewer's UTC offset and the UI renders
    times in the viewer's zone, so a Singapore afternoon stamped UTC and left
    alone resurfaced eight hours later — a Tuesday receipt filed on Wednesday,
    just after midnight.
    """

    def test_the_offset_tag_beside_the_timestamp_is_used(self):
        """What a phone that has been abroad writes, and the plain answer."""
        data = make_jpeg(taken_at=datetime(2026, 8, 2, 17, 20, 27), offset="+08:00")
        exif = extract_exif(data)
        assert exif.taken_at == datetime(2026, 8, 2, 9, 20, 27, tzinfo=UTC)
        assert exif.tz_offset_minutes == 480

    def test_a_western_offset_goes_the_other_way(self):
        data = make_jpeg(taken_at=datetime(2026, 8, 2, 17, 20, 0), offset="-05:00")
        exif = extract_exif(data)
        assert exif.taken_at == datetime(2026, 8, 2, 22, 20, 0, tzinfo=UTC)
        assert exif.tz_offset_minutes == -300

    def test_an_offset_without_its_colon_reads_the_same(self):
        exif = extract_exif(make_jpeg(taken_at=datetime(2026, 8, 2, 17, 20), offset="+0530"))
        assert exif.tz_offset_minutes == 330

    def test_zulu_is_an_offset_of_none(self):
        exif = extract_exif(make_jpeg(taken_at=datetime(2026, 8, 2, 17, 20), offset="Z"))
        assert exif.taken_at == datetime(2026, 8, 2, 17, 20, tzinfo=UTC)
        assert exif.tz_offset_minutes == 0

    def test_the_gps_clock_gives_the_offset_away(self):
        """It is UTC by definition, so the gap to the wall clock is the zone.

        This is the older phone's answer: GPS but no offset tag.
        """
        data = make_jpeg(
            taken_at=datetime(2026, 8, 2, 17, 20, 27),
            gps_utc=datetime(2026, 8, 2, 9, 20, 25),  # the fix is never simultaneous
        )
        exif = extract_exif(data)
        assert exif.tz_offset_minutes == 480
        assert exif.taken_at == datetime(2026, 8, 2, 9, 20, 27, tzinfo=UTC)

    def test_a_gps_clock_across_midnight_still_works(self):
        """Which is why the date stamp is required and the time alone is not."""
        data = make_jpeg(
            taken_at=datetime(2026, 8, 3, 0, 56, 0),
            gps_utc=datetime(2026, 8, 2, 16, 56, 0),
        )
        exif = extract_exif(data)
        assert exif.tz_offset_minutes == 480
        assert exif.taken_at == datetime(2026, 8, 2, 16, 56, tzinfo=UTC)

    def test_a_half_hour_zone_survives_the_rounding(self):
        data = make_jpeg(
            taken_at=datetime(2026, 8, 2, 17, 20, 0),
            gps_utc=datetime(2026, 8, 2, 11, 50, 3),
        )
        assert extract_exif(data).tz_offset_minutes == 330

    def test_the_offset_tag_beats_the_gps_clock(self):
        """The camera's own answer about its zone needs no arithmetic."""
        data = make_jpeg(
            taken_at=datetime(2026, 8, 2, 17, 20, 0),
            offset="+08:00",
            gps_utc=datetime(2026, 8, 2, 12, 20, 0),  # would imply +05:00
        )
        assert extract_exif(data).tz_offset_minutes == 480

    def test_a_gps_time_with_no_date_is_not_enough(self):
        """A time alone cannot say which day it is on, and guessing costs one."""
        data = make_jpeg(
            taken_at=datetime(2026, 8, 2, 17, 20),
            gps_extra={piexif.GPSIFD.GPSTimeStamp: [(9, 1), (20, 1), (0, 1)]},
        )
        exif = extract_exif(data)
        assert exif.tz_offset_minutes is None
        assert exif.taken_at == datetime(2026, 8, 2, 17, 20, tzinfo=UTC)

    def test_a_photo_that_says_nothing_keeps_the_old_reading(self):
        """No zone is knowable, so the wall clock stands as it always did."""
        exif = extract_exif(make_jpeg(taken_at=datetime(2026, 8, 2, 17, 20)))
        assert exif.taken_at == datetime(2026, 8, 2, 17, 20, tzinfo=UTC)
        assert exif.tz_offset_minutes is None

    @pytest.mark.parametrize("offset", ["", "  ", "+8", "abcde", "+99:00", "08:00", "+08:99"])
    def test_an_unreadable_offset_is_no_offset(self, offset):
        """Including the all-spaces tag a camera writes when it has no answer."""
        exif = extract_exif(make_jpeg(taken_at=datetime(2026, 8, 2, 17, 20), offset=offset))
        assert exif.tz_offset_minutes is None
        assert exif.taken_at == datetime(2026, 8, 2, 17, 20, tzinfo=UTC)

    def test_an_impossible_gps_gap_is_not_a_zone(self):
        """Two clocks a week apart is a broken camera, not somewhere far away."""
        data = make_jpeg(
            taken_at=datetime(2026, 8, 2, 17, 20),
            gps_utc=datetime(2026, 7, 26, 17, 20),
        )
        exif = extract_exif(data)
        assert exif.tz_offset_minutes is None
        assert exif.taken_at == datetime(2026, 8, 2, 17, 20, tzinfo=UTC)

    def test_the_gps_clock_does_not_disturb_the_coordinates(self):
        data = make_jpeg(
            lat=1.2833,
            lng=103.8437,
            taken_at=datetime(2026, 8, 2, 17, 20),
            gps_utc=datetime(2026, 8, 2, 9, 20),
        )
        exif = extract_exif(data)
        assert exif.lat == pytest.approx(1.2833, abs=1e-4)
        assert exif.lng == pytest.approx(103.8437, abs=1e-4)
        assert exif.tz_offset_minutes == 480


async def test_an_evening_photo_stays_on_the_evening_it_was_taken(client):
    """The visible half of the bug, end to end.

    A receipt photographed at 17:20 in Singapore was stored as 17:20 UTC and
    then read back through the viewer's +08:00 — landing on the next day at
    01:20, on a timeline whose header still said Tuesday.
    """
    await register(client)
    response = await client.post(
        "/api/images",
        files=[
            (
                "files",
                (
                    "receipt.jpg",
                    make_jpeg(taken_at=datetime(2026, 8, 2, 17, 20, 27), offset="+08:00"),
                    "image/jpeg",
                ),
            )
        ],
    )
    assert response.status_code == 201, response.text
    image_id = response.json()[0]["id"]

    singapore = 8 * 60
    tuesday = await client.get(f"/api/timeline?date=2026-08-02&tz_offset_minutes={singapore}")
    wednesday = await client.get(f"/api/timeline?date=2026-08-03&tz_offset_minutes={singapore}")

    def shown(day):
        return [image["id"] for image in day.json()["unassigned_images"]]

    assert shown(tuesday) == [image_id]
    assert shown(wednesday) == [], "it was photographed on Tuesday evening, not after midnight"
