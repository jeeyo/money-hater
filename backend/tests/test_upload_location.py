"""Where the phone was when a photo was uploaded.

Most receipts arrive with no coordinates at all: the camera has location off,
the shot is a screenshot, or it came through a chat app that stripped the EXIF
on the way. The browser can still say where its owner is standing, and for a
receipt photographed and uploaded on the spot that is the missing half of the
answer — enough to turn "Ramen Ya" into a place on the map.

It is kept well away from the photo's own fix, though. `lat`/`lng` is the
shutter's, and it decides the map pin and the stop the photo clusters into; a
receipt photographed at the till and uploaded from the hotel would rewrite the
evening around the hotel. The uploader's fix only ever anchors a name the photo
supplies itself.
"""

import sqlalchemy as sa

import app.services.analysis as analysis_mod
from app.models import Expense, Image, Place
from app.services.analysis import _photo_context, run_image_analysis
from app.services.vision import ReceiptData, VisionResult
from tests.conftest import register
from tests.util import make_jpeg

BKK = (13.7563, 100.5018)
THONGLOR = (13.7240, 100.5800)
CHIANG_MAI = (18.7930, 98.9853)

A_RECEIPT = VisionResult(
    kind="receipt",
    caption="Receipt from a ramen shop",
    labels=["receipt"],
    receipt=ReceiptData(merchant="Ramen Ya", currency="THB", total=345.50),
)


async def _a_place(db_sessionmaker, name: str, coords: tuple[float, float]) -> int:
    async with db_sessionmaker() as db:
        place = Place(
            google_place_id=f"ChIJ-{name}-{coords[0]}",
            name=name,
            formatted_address=f"{name} address",
            lat=coords[0],
            lng=coords[1],
            types=["restaurant"],
        )
        db.add(place)
        await db.commit()
        return place.id


async def _upload(client, name="shot.png", jpeg=None, **params) -> dict:
    query = "&".join(f"{key}={value}" for key, value in params.items())
    response = await client.post(
        f"/api/images?{query}" if query else "/api/images",
        files=[("files", (name, jpeg or make_jpeg(color=(5, 5, 5)), "image/jpeg"))],
    )
    assert response.status_code == 201, response.text
    return response.json()[0]


async def test_the_uploaders_fix_is_recorded_beside_the_photos_own(client, db_sessionmaker):
    await register(client)
    created = await _upload(client, lat=BKK[0], lng=BKK[1])

    async with db_sessionmaker() as db:
        image = await db.get(Image, created["id"])
        assert (image.upload_lat, image.upload_lng) == BKK
        # The photo had none of its own, and did not acquire one
        assert image.lat is None and image.lng is None


async def test_the_photos_own_fix_is_not_overwritten_by_the_uploaders(client, db_sessionmaker):
    """Two different facts: where the shutter went, and where its owner is now."""
    await register(client)
    created = await _upload(
        client, name="r.jpg", jpeg=make_jpeg(*THONGLOR), lat=BKK[0], lng=BKK[1]
    )

    async with db_sessionmaker() as db:
        image = await db.get(Image, created["id"])
        assert round(image.lat, 3) == round(THONGLOR[0], 3)
        assert (image.upload_lat, image.upload_lng) == BKK


async def test_half_a_coordinate_pair_is_not_a_location(client, db_sessionmaker):
    await register(client)
    created = await _upload(client, lat=BKK[0])

    async with db_sessionmaker() as db:
        image = await db.get(Image, created["id"])
        assert image.upload_lat is None and image.upload_lng is None


async def test_a_nonsense_coordinate_is_refused(client):
    await register(client)
    response = await client.post(
        "/api/images?lat=999&lng=0",
        files=[("files", ("a.jpg", make_jpeg(), "image/jpeg"))],
    )
    assert response.status_code == 422


async def test_an_upload_with_no_location_still_works(client, db_sessionmaker):
    """The browser may refuse, and a photo is worth more than its coordinates."""
    await register(client)
    created = await _upload(client)

    async with db_sessionmaker() as db:
        image = await db.get(Image, created["id"])
        assert image.upload_lat is None
        assert image.status == "pending"


async def test_the_analyst_is_told_where_its_owner_was(client, db_sessionmaker):
    await register(client)
    created = await _upload(client, lat=BKK[0], lng=BKK[1])
    await _a_place(db_sessionmaker, "Kopi 1930", BKK)

    async with db_sessionmaker() as db:
        context = await _photo_context(db, await db.get(Image, created["id"]))

    assert (context.uploader_lat, context.uploader_lng) == BKK
    assert context.lat is None, "the photo itself still says nothing"
    assert context.place_name == "Kopi 1930"
    text = context.as_prompt()
    assert "camera recorded no location" in text
    assert "13.75630, 100.50180" in text
    assert "only if it went up soon after" in text, "said for what it is"


async def test_a_photo_with_its_own_fix_describes_that_one(client, db_sessionmaker):
    await register(client)
    created = await _upload(
        client, name="r.jpg", jpeg=make_jpeg(*THONGLOR), lat=CHIANG_MAI[0], lng=CHIANG_MAI[1]
    )

    async with db_sessionmaker() as db:
        context = await _photo_context(db, await db.get(Image, created["id"]))

    text = context.as_prompt()
    assert "Taken at 13.72" in text
    assert context.uploader_lat is None
    assert "18.79" not in text, "the uploader's fix is not mentioned over the camera's"


async def test_the_merchant_is_matched_near_where_its_owner_stood(
    client, db_sessionmaker, monkeypatch
):
    """The whole point: a receipt screenshot, and the shop it names is found."""

    async def fake_vision(path, mime, context=None):
        return A_RECEIPT

    monkeypatch.setattr(analysis_mod, "analyze_image_content", fake_vision)
    await register(client)
    place_id = await _a_place(db_sessionmaker, "Ramen Ya", THONGLOR)
    # The user's home is at the other end of the country, so only the fix sent
    # with the upload can put this receipt in Bangkok.
    await client.patch(
        "/api/auth/me", json={"home_lat": CHIANG_MAI[0], "home_lng": CHIANG_MAI[1]}
    )
    created = await _upload(client, lat=BKK[0], lng=BKK[1])

    async with db_sessionmaker() as db:
        await run_image_analysis(db, created["id"])
        assert (await db.get(Image, created["id"])).place_id == place_id


async def test_the_uploaders_fix_never_names_a_photo_by_itself(
    client, db_sessionmaker, monkeypatch
):
    """It says where a person is, not where a photo was taken. Alone it is not evidence."""

    async def fake_vision(path, mime, context=None):
        return VisionResult(kind="food", caption="a bowl of ramen", labels=["ramen"])

    monkeypatch.setattr(analysis_mod, "analyze_image_content", fake_vision)
    await register(client)
    await _a_place(db_sessionmaker, "Kopi 1930", BKK)
    created = await _upload(client, name="food.jpg", lat=BKK[0], lng=BKK[1])

    async with db_sessionmaker() as db:
        await run_image_analysis(db, created["id"])
        image = await db.get(Image, created["id"])
        assert image.place_id is None
        # And it stays out of the clustering input, which is the camera's fix
        assert image.lat is None


async def test_it_is_not_used_where_the_photo_knows_better(client, db_sessionmaker, monkeypatch):
    async def fake_vision(path, mime, context=None):
        return A_RECEIPT

    monkeypatch.setattr(analysis_mod, "analyze_image_content", fake_vision)
    await register(client)
    here = await _a_place(db_sessionmaker, "Ramen Ya", THONGLOR)
    await _a_place(db_sessionmaker, "Ramen Ya", CHIANG_MAI)
    # Photographed in Bangkok, uploaded from Chiang Mai the next week
    created = await _upload(
        client,
        name="r.jpg",
        jpeg=make_jpeg(*BKK),
        lat=CHIANG_MAI[0],
        lng=CHIANG_MAI[1],
    )

    async with db_sessionmaker() as db:
        await run_image_analysis(db, created["id"])
        assert (await db.get(Image, created["id"])).place_id == here


async def test_reanalysis_still_has_it(client, db_sessionmaker, monkeypatch):
    """It is on the row, not in the request — so pressing Re-analyze keeps it."""

    async def fake_vision(path, mime, context=None):
        return A_RECEIPT

    monkeypatch.setattr(analysis_mod, "analyze_image_content", fake_vision)
    await register(client)
    created = await _upload(client, lat=BKK[0], lng=BKK[1])
    async with db_sessionmaker() as db:
        await run_image_analysis(db, created["id"])
        assert (await db.get(Image, created["id"])).place_id is None

    place_id = await _a_place(db_sessionmaker, "Ramen Ya", THONGLOR)
    async with db_sessionmaker() as db:
        await run_image_analysis(db, created["id"])
        assert (await db.get(Image, created["id"])).place_id == place_id

    async with db_sessionmaker() as db:
        assert (await db.scalar(sa.select(Expense))).place_id == place_id
