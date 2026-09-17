"""Putting a receipt on the map by the name printed across the top of it.

A receipt is the photo least likely to say where it was taken. A screenshot or
a share from a chat carries no GPS at all, and a fix taken inside a mall lands
in the middle of the building with no shop under it — so the reverse-geocode
that names every other photo comes back with nothing, over and over, for the
photos that are actually the money.

What a receipt does have is the merchant's name. A name plus a rough idea of
where its owner was is enough to find the place on Google's map; a name on its
own is not, because every franchise has a branch in every city, so the lookup
does not happen at all without somewhere to anchor it.
"""

import httpx
import sqlalchemy as sa

import app.services.analysis as analysis_mod
import app.services.places as places_mod
from app.config import settings
from app.models import Expense, Image, Place
from app.services.analysis import run_image_analysis
from app.services.places import find_merchant_place
from app.services.vision import ReceiptData, VisionResult
from tests.conftest import register
from tests.util import make_jpeg

BKK = (13.7563, 100.5018)
# Same city, a few km off — the branch across town case
THONGLOR = (13.7240, 100.5800)
CHIANG_MAI = (18.7930, 98.9853)

A_RECEIPT = VisionResult(
    kind="receipt",
    caption="Receipt from a ramen shop",
    labels=["receipt"],
    receipt=ReceiptData(merchant="Ramen Ya", currency="THB", total=345.50),
)


def _google_answers(*places: tuple[str, str, tuple[float, float]]):
    """An httpx stand-in answering every Places call with these results."""
    payload = {
        "places": [
            {
                "id": place_id,
                "displayName": {"text": name},
                "formattedAddress": f"{name} address",
                "location": {"latitude": coords[0], "longitude": coords[1]},
                "types": ["restaurant"],
            }
            for place_id, name, coords in places
        ]
    }

    class FakeClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        async def post(self, url, **kwargs):
            return httpx.Response(200, json=payload, request=httpx.Request("POST", url))

    return FakeClient


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


async def test_a_place_already_known_by_that_name_answers_for_free(db, db_sessionmaker):
    place_id = await _a_place(db_sessionmaker, "Ramen Ya", THONGLOR)
    found = await find_merchant_place(db, "ramen ya", near=BKK)
    assert found is not None and found.id == place_id


async def test_the_same_name_in_another_city_is_not_it(db, db_sessionmaker):
    await _a_place(db_sessionmaker, "Ramen Ya", CHIANG_MAI)
    assert await find_merchant_place(db, "Ramen Ya", near=BKK) is None


async def test_the_nearest_of_several_branches_wins(db, db_sessionmaker):
    near_id = await _a_place(db_sessionmaker, "Ramen Ya", BKK)
    await _a_place(db_sessionmaker, "Ramen Ya", THONGLOR)
    found = await find_merchant_place(db, "Ramen Ya", near=BKK)
    assert found is not None and found.id == near_id


async def test_a_name_with_nowhere_to_anchor_it_is_not_looked_up(db, db_sessionmaker, monkeypatch):
    """Every franchise has a branch everywhere; the nearest one to nothing is noise."""
    await _a_place(db_sessionmaker, "Ramen Ya", BKK)
    monkeypatch.setattr(settings, "google_maps_api_key", "AIza-looks-fine")
    monkeypatch.setattr(places_mod.httpx, "AsyncClient", _google_answers())
    assert await find_merchant_place(db, "Ramen Ya", near=None) is None


async def test_google_is_asked_when_the_name_is_new(db, monkeypatch):
    monkeypatch.setattr(settings, "google_maps_api_key", "AIza-looks-fine")
    monkeypatch.setattr(
        places_mod.httpx, "AsyncClient", _google_answers(("g-ramen", "Ramen Ya", THONGLOR))
    )
    found = await find_merchant_place(db, "Ramen Ya", near=BKK)
    assert found is not None and found.name == "Ramen Ya"
    # Cached on the way past, so the next receipt from there costs nothing
    assert await db.scalar(sa.select(Place).where(Place.google_place_id == "g-ramen")) is not None


async def test_an_answer_from_the_wrong_end_of_the_country_is_thrown_away(db, monkeypatch):
    """A location bias is a suggestion to Google, not a filter."""
    monkeypatch.setattr(settings, "google_maps_api_key", "AIza-looks-fine")
    monkeypatch.setattr(
        places_mod.httpx, "AsyncClient", _google_answers(("g-far", "Ramen Ya", CHIANG_MAI))
    )
    assert await find_merchant_place(db, "Ramen Ya", near=BKK) is None


async def test_the_merchant_places_a_receipt_that_carried_no_gps(
    client, db_sessionmaker, monkeypatch
):
    """The whole point: a screenshot of a receipt, and it still lands somewhere."""

    async def fake_vision(path, mime, context=None):
        return A_RECEIPT

    monkeypatch.setattr(analysis_mod, "analyze_image_content", fake_vision)
    await register(client)
    await client.patch("/api/auth/me", json={"home_lat": BKK[0], "home_lng": BKK[1]})
    place_id = await _a_place(db_sessionmaker, "Ramen Ya", THONGLOR)

    created = (
        await client.post(
            "/api/images",
            files=[("files", ("shot.png", make_jpeg(color=(5, 5, 5)), "image/jpeg"))],
        )
    ).json()
    async with db_sessionmaker() as db:
        await run_image_analysis(db, created[0]["id"])

    async with db_sessionmaker() as db:
        assert (await db.get(Image, created[0]["id"])).place_id == place_id
        # And the money read off it goes to the same place
        assert (await db.scalar(sa.select(Expense))).place_id == place_id


async def test_a_fix_that_resolves_still_wins_over_the_printed_name(
    client, db_sessionmaker, monkeypatch
):
    """GPS is measured; a merchant line is read off a photo. Measured goes first."""

    async def fake_vision(path, mime, context=None):
        return A_RECEIPT

    monkeypatch.setattr(analysis_mod, "analyze_image_content", fake_vision)
    await register(client)
    await _a_place(db_sessionmaker, "Ramen Ya", THONGLOR)
    by_gps = await _a_place(db_sessionmaker, "Kopi 1930", BKK)

    created = (
        await client.post(
            "/api/images",
            files=[("files", ("r.jpg", make_jpeg(*BKK, color=(6, 6, 6)), "image/jpeg"))],
        )
    ).json()
    async with db_sessionmaker() as db:
        await run_image_analysis(db, created[0]["id"])

    async with db_sessionmaker() as db:
        assert (await db.get(Image, created[0]["id"])).place_id == by_gps


async def test_a_place_the_user_picked_is_left_alone(client, db_sessionmaker, monkeypatch):
    """Re-analysis must not hand a corrected photo back to the shop next door."""

    async def fake_vision(path, mime, context=None):
        return A_RECEIPT

    monkeypatch.setattr(analysis_mod, "analyze_image_content", fake_vision)
    await register(client)
    await client.patch("/api/auth/me", json={"home_lat": BKK[0], "home_lng": BKK[1]})
    await _a_place(db_sessionmaker, "Ramen Ya", THONGLOR)
    theirs = await _a_place(db_sessionmaker, "Sarnies", BKK)

    created = (
        await client.post(
            "/api/images",
            files=[("files", ("shot.png", make_jpeg(color=(7, 7, 7)), "image/jpeg"))],
        )
    ).json()
    image_id = created[0]["id"]
    await client.patch(f"/api/images/{image_id}", json={"place_id": theirs})

    async with db_sessionmaker() as db:
        await run_image_analysis(db, image_id)

    async with db_sessionmaker() as db:
        assert (await db.get(Image, image_id)).place_id == theirs


async def test_a_sign_in_the_photo_places_it_too(client, db_sessionmaker, monkeypatch):
    """Not only receipts: a storefront the model could read names the photo."""

    async def fake_vision(path, mime, context=None):
        return VisionResult(
            kind="place",
            caption="A coffee shop front",
            labels=["cafe"],
            place_hint="Kopi 1930",
        )

    monkeypatch.setattr(analysis_mod, "analyze_image_content", fake_vision)
    await register(client)
    await client.patch("/api/auth/me", json={"home_lat": BKK[0], "home_lng": BKK[1]})
    place_id = await _a_place(db_sessionmaker, "Kopi 1930", THONGLOR)

    created = (
        await client.post(
            "/api/images",
            files=[("files", ("front.png", make_jpeg(color=(4, 4, 4)), "image/jpeg"))],
        )
    ).json()
    async with db_sessionmaker() as db:
        await run_image_analysis(db, created[0]["id"])

    async with db_sessionmaker() as db:
        assert (await db.get(Image, created[0]["id"])).place_id == place_id


def test_distance_guard_is_a_city_not_a_country():
    """A branch across town is plausible; the next province is not."""
    from app.services.geo import haversine_m

    assert haversine_m(*BKK, *THONGLOR) < places_mod.MERCHANT_MAX_DISTANCE_M
    assert haversine_m(*BKK, *CHIANG_MAI) > places_mod.MERCHANT_MAX_DISTANCE_M
