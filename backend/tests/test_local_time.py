"""One frame for every recorded moment: the clock that was on the wall.

The bug these are here to keep fixed: a receipt photographed at 20:36 in
Bangkok came back as 03:36 the following morning — filed on the wrong day,
counted in the wrong day's spend — because the camera's local clock was stored
as though it were UTC and then had the viewer's offset added to it again.

See `app.services.localtime` for the frame itself.
"""

from datetime import UTC, datetime, timedelta

import sqlalchemy as sa

from app.models import Image
from app.services.analysis import run_image_analysis
from app.services.localtime import local_now, to_local
from tests.conftest import register
from tests.util import make_jpeg

BKK_TZ = 7 * 60  # Bangkok, minutes east of UTC
BKK = (13.7563, 100.5018)
DINNER = datetime(2026, 8, 10, 20, 36, tzinfo=UTC)  # the wall clock, not an instant


def gps_clock(utc: datetime) -> dict:
    """The GPS tags a phone writes: the same moment, in real UTC."""
    import piexif

    return {
        piexif.GPSIFD.GPSDateStamp: utc.strftime("%Y:%m:%d"),
        piexif.GPSIFD.GPSTimeStamp: [(utc.hour, 1), (utc.minute, 1), (utc.second, 1)],
    }


async def _upload(client, filename: str, data: bytes, tz: int = 0) -> dict:
    response = await client.post(
        f"/api/images?tz_offset_minutes={tz}",
        files=[("files", (filename, data, "image/jpeg"))],
    )
    assert response.status_code == 201, response.text
    return response.json()[0]


def test_only_a_real_instant_is_moved_onto_the_wall():
    """`to_local` is the one door between the two frames, and it opens one way."""
    instant = datetime(2026, 8, 10, 13, 36, tzinfo=UTC)
    assert to_local(instant, BKK_TZ) == datetime(2026, 8, 10, 20, 36, tzinfo=UTC)
    assert to_local(instant, -5 * 60) == datetime(2026, 8, 10, 8, 36, tzinfo=UTC)
    assert to_local(instant, 0) == instant
    # A naive datetime is read as UTC rather than rejected — sqlite hands those back
    assert to_local(instant.replace(tzinfo=None), BKK_TZ).hour == 20
    assert local_now(BKK_TZ, now=instant) == datetime(2026, 8, 10, 20, 36, tzinfo=UTC)


async def test_a_photo_keeps_the_time_its_camera_recorded(client):
    """20:36 on the camera is 20:36 in the column — no zone applied to it."""
    await register(client)
    photo = await _upload(
        client,
        "dinner.jpg",
        make_jpeg(
            *BKK,
            taken_at=DINNER,
            offset="+07:00",
            gps_extra=gps_clock(datetime(2026, 8, 10, 13, 36, tzinfo=UTC)),
        ),
        tz=BKK_TZ,
    )
    assert photo["taken_at"].startswith("2026-08-10T20:36")
    assert photo["taken_at_source"] == "exif"


async def test_the_zone_a_photo_states_is_recorded_but_not_applied(client, db_sessionmaker):
    """Both zone hints survive in `exif` — as evidence, not as an instruction.

    Acting on them is what shipped once and was reverted: only the photos
    carrying a zone would move, so a screenshot taken minutes later stayed put
    and the two ended up hours apart.
    """
    await register(client)
    photo = await _upload(
        client,
        "dinner.jpg",
        make_jpeg(
            *BKK,
            taken_at=DINNER,
            offset="+07:00",
            gps_extra=gps_clock(datetime(2026, 8, 10, 13, 36, tzinfo=UTC)),
        ),
        tz=BKK_TZ,
    )
    async with db_sessionmaker() as db:
        stored = await db.get(Image, photo["id"])
        assert stored.exif["OffsetTimeOriginal"] == "+07:00"
        assert stored.exif["GPS"]["GPSDateStamp"] == "2026:08:10"
        assert stored.taken_at.replace(tzinfo=UTC) == DINNER


async def test_a_photos_day_is_its_own_day_whoever_is_looking(client):
    """The evening in Bangkok is the 10th from Bangkok, London and New York."""
    await register(client)
    photo = await _upload(client, "dinner.jpg", make_jpeg(*BKK, taken_at=DINNER), tz=BKK_TZ)

    for viewer in (BKK_TZ, 0, -5 * 60):
        on_the_day = (
            await client.get(f"/api/timeline?date=2026-08-10&tz_offset_minutes={viewer}")
        ).json()
        shown = [i["id"] for v in on_the_day["visits"] for i in v["images"]] + [
            i["id"] for i in on_the_day["unassigned_images"]
        ]
        assert photo["id"] in shown, f"viewer at {viewer} should see it on the 10th"

        tomorrow = (
            await client.get(f"/api/timeline?date=2026-08-11&tz_offset_minutes={viewer}")
        ).json()
        assert tomorrow["visits"] == [] and tomorrow["unassigned_images"] == [], (
            f"viewer at {viewer} should not find the 10th's dinner on the 11th"
        )


async def test_the_evenings_spend_counts_on_the_evening(client):
    """The number under the date is what that day cost, on that day's clock."""
    user = await register(client)
    assert user["preferred_currency"] == "THB"
    created = await client.post(
        "/api/expenses",
        json={
            "total": 1316.70,
            "currency": "THB",
            "merchant": "Fam Time Steak and Pasta",
            "spent_at": "2026-08-10T20:35:00Z",
        },
    )
    assert created.status_code == 201, created.text

    day = (
        await client.get(f"/api/timeline?date=2026-08-10&tz_offset_minutes={BKK_TZ}")
    ).json()
    assert day["spend"]["base_total_minor"] == 131670

    next_day = (
        await client.get(f"/api/timeline?date=2026-08-11&tz_offset_minutes={BKK_TZ}")
    ).json()
    assert next_day["spend"]["base_total_minor"] == 0


async def test_two_photos_minutes_apart_stay_minutes_apart(client, db_sessionmaker):
    """The plate and the bill, one phone, six minutes — and one screenshot.

    The screenshot has no zone to state and the camera photo does. Whatever is
    done with that, it has to be done to both or to neither: this pair is the
    exact shape that came out seven hours apart last time, on two different
    days, in two different stops.
    """
    await register(client)
    plate = await _upload(
        client,
        "plate.jpg",
        make_jpeg(*BKK, taken_at=datetime(2026, 8, 10, 20, 30, tzinfo=UTC), offset="+07:00"),
        tz=BKK_TZ,
    )
    screenshot = await _upload(
        client,
        "bill.png.jpg",
        make_jpeg(taken_at=DINNER, color=(2, 2, 2)),
        tz=BKK_TZ,
    )

    async with db_sessionmaker() as db:
        moments = {
            image.id: image.taken_at.replace(tzinfo=UTC)
            for image in (await db.execute(sa.select(Image))).scalars()
        }
    assert moments[screenshot["id"]] - moments[plate["id"]] == timedelta(minutes=6)

    day = (
        await client.get(f"/api/timeline?date=2026-08-10&tz_offset_minutes={BKK_TZ}")
    ).json()
    shown = [i["id"] for v in day["visits"] for i in v["images"]] + [
        i["id"] for i in day["unassigned_images"]
    ]
    assert {plate["id"], screenshot["id"]} <= set(shown)


async def test_a_photo_with_no_clock_is_filed_on_the_uploaders_clock(client, db_sessionmaker):
    """A photo whose camera wrote no time falls back to when it arrived.

    Which has to be *your* evening rather than the server's afternoon — the
    fallback lands in the same frame as everything else, or it lands hours from
    the photos it was uploaded beside.
    """
    await register(client)
    photo = await _upload(client, "undated.jpg", make_jpeg(color=(4, 4, 4)), tz=BKK_TZ)
    assert photo["taken_at_source"] == "upload"

    filed = datetime.fromisoformat(photo["taken_at"].replace("Z", "+00:00"))
    assert abs(filed - local_now(BKK_TZ)) < timedelta(minutes=1)


async def test_re_analysis_leaves_an_undated_photo_where_it_was_filed(client, db_sessionmaker):
    """"Re-analyze" must not drag it back onto the server's clock.

    The worker has no request to ask for your offset, so a second pass that
    reached for `uploaded_at` again would move the photo by that whole offset —
    off its day, and away from the stop it had joined.
    """
    await register(client)
    photo = await _upload(client, "undated.jpg", make_jpeg(color=(5, 5, 5)), tz=BKK_TZ)

    async with db_sessionmaker() as db:
        before = (await db.get(Image, photo["id"])).taken_at
        await run_image_analysis(db, photo["id"])
        assert (await db.get(Image, photo["id"])).taken_at == before


async def test_tonights_expense_can_open_a_trip_from_east_of_the_server(client):
    """An evening in Bangkok is not the future, whatever the server's clock says.

    An open trip is bounded by an expense that cannot be later than "now", and
    "now" was the server's UTC instant while the expense was a Bangkok wall
    clock. Seven hours ahead, everything spent after five in the afternoon
    looked like tomorrow, and the trip was refused.
    """
    await register(client)
    tonight = local_now(BKK_TZ).replace(microsecond=0)
    expense = await client.post(
        "/api/expenses",
        json={
            "total": 120,
            "currency": "THB",
            "description": "Airport taxi",
            "spent_at": tonight.isoformat().replace("+00:00", "Z"),
        },
    )
    assert expense.status_code == 201, expense.text

    trip = await client.post(
        f"/api/trips?tz_offset_minutes={BKK_TZ}",
        json={"title": "Out in Bangkok", "start_expense_id": expense.json()["id"]},
    )
    assert trip.status_code == 201, trip.text
    assert trip.json()["end_expense_id"] is None
