"""Place suggestions for the expense "Where" field."""

from datetime import datetime

import pytest
import sqlalchemy as sa

import app.services.places as places_mod
from app.models import Place, Visit
from app.services.analysis import run_image_analysis
from tests.conftest import register
from tests.util import make_jpeg

# Two Bangkok places ~5km apart, both "visited"
CAFE = dict(google_place_id="p-cafe", name="Bootleg Coffee", lat=13.7790, lng=100.5430)
RAMEN = dict(google_place_id="p-ramen", name="Menya Itto", lat=13.7466, lng=100.5395)
FAR = dict(google_place_id="p-cnx", name="Graph Cafe Chiang Mai", lat=18.7930, lng=98.9853)


async def _seed_itinerary(client, db_sessionmaker) -> dict[str, int]:
    """Two visits on 2026-08-08: the cafe at 08:30, the ramen shop at 12:30."""
    await register(client)
    for name, coords, when in [
        ("cafe.jpg", (CAFE["lat"], CAFE["lng"]), datetime(2026, 8, 8, 8, 30)),
        ("ramen.jpg", (RAMEN["lat"], RAMEN["lng"]), datetime(2026, 8, 8, 12, 30)),
    ]:
        created = (
            await client.post(
                "/api/images",
                files=[("files", (name, make_jpeg(*coords, taken_at=when), "image/jpeg"))],
            )
        ).json()
        async with db_sessionmaker() as db:
            await run_image_analysis(db, created[0]["id"])

    # Attach real place names to the two visits (GPS resolution needs a Google key)
    async with db_sessionmaker() as db:
        visits = (
            (await db.execute(sa.select(Visit).order_by(Visit.started_at))).scalars().all()
        )
        ids = {}
        for visit, data in zip(visits, [CAFE, RAMEN], strict=True):
            place = Place(**data, formatted_address=f"{data['name']} address", types=["cafe"])
            db.add(place)
            await db.flush()
            visit.place_id = place.id
            ids[data["name"]] = place.id
        db.add(Place(**FAR, formatted_address="Chiang Mai", types=["cafe"]))
        await db.commit()
    return ids


async def test_suggestions_are_places_from_the_itinerary(client, db_sessionmaker):
    await _seed_itinerary(client, db_sessionmaker)
    response = await client.get("/api/places/suggest", params={"q": ""})
    assert response.status_code == 200
    names = [p["name"] for p in response.json()]
    assert "Bootleg Coffee" in names
    assert "Menya Itto" in names
    # A place in the cache the user never visited is not suggested
    assert "Graph Cafe Chiang Mai" not in names
    assert all(p["source"] == "visited" for p in response.json())


async def test_query_filters_by_name(client, db_sessionmaker):
    await _seed_itinerary(client, db_sessionmaker)
    results = (await client.get("/api/places/suggest", params={"q": "menya"})).json()
    assert [p["name"] for p in results] == ["Menya Itto"]


async def test_results_are_ranked_by_distance_from_where_you_were(client, db_sessionmaker):
    """Adding an expense at lunchtime should offer the lunch place first."""
    await _seed_itinerary(client, db_sessionmaker)

    at_lunch = (
        await client.get(
            "/api/places/suggest", params={"q": "", "at": "2026-08-08T12:35:00Z"}
        )
    ).json()
    assert at_lunch[0]["name"] == "Menya Itto"
    assert at_lunch[0]["distance_m"] < at_lunch[1]["distance_m"]

    at_breakfast = (
        await client.get(
            "/api/places/suggest", params={"q": "", "at": "2026-08-08T08:35:00Z"}
        )
    ).json()
    assert at_breakfast[0]["name"] == "Bootleg Coffee"


async def test_time_between_stops_uses_the_nearest_visit(client, db_sessionmaker):
    await _seed_itinerary(client, db_sessionmaker)
    # 11:30 is inside no visit but closest to the 12:30 lunch stop
    results = (
        await client.get(
            "/api/places/suggest", params={"q": "", "at": "2026-08-08T11:30:00Z"}
        )
    ).json()
    assert results[0]["name"] == "Menya Itto"


async def test_google_is_not_called_when_the_itinerary_answers(
    client, db_sessionmaker, monkeypatch
):
    """Keystroke-driven UI must not bill a Places call per character."""
    called = False

    async def _spy(query, anchor, limit):
        nonlocal called
        called = True
        return []

    monkeypatch.setattr(places_mod, "_google_text_search", _spy)
    await _seed_itinerary(client, db_sessionmaker)

    await client.get("/api/places/suggest", params={"q": "m"})  # single char
    assert called is False

    await client.get("/api/places/suggest", params={"q": "menya"})
    assert called is False  # a local hit is enough


async def test_google_fills_in_when_the_itinerary_has_nothing(
    client, db_sessionmaker, monkeypatch
):
    async def _fake_search(query, anchor, limit):
        assert anchor is not None  # biased to where the user was
        return [
            {
                "id": "g-new",
                "displayName": {"text": "Som Tam Nua"},
                "formattedAddress": "Siam Square Soi 5",
                "location": {"latitude": 13.7448, "longitude": 100.5340},
                "types": ["restaurant"],
            }
        ]

    monkeypatch.setattr(places_mod, "_google_text_search", _fake_search)
    await _seed_itinerary(client, db_sessionmaker)

    results = (
        await client.get(
            "/api/places/suggest", params={"q": "som tam", "at": "2026-08-08T12:35:00Z"}
        )
    ).json()
    assert [p["name"] for p in results] == ["Som Tam Nua"]
    assert results[0]["source"] == "google"
    assert results[0]["distance_m"] is not None

    # Cached, so picking it later costs nothing
    async with db_sessionmaker() as db:
        cached = await db.scalar(sa.select(Place).where(Place.google_place_id == "g-new"))
        assert cached is not None


async def test_suggestions_are_user_scoped(client, db_sessionmaker):
    await _seed_itinerary(client, db_sessionmaker)
    await client.post("/api/auth/logout")
    await register(client, email="bob@example.com")
    assert (await client.get("/api/places/suggest", params={"q": ""})).json() == []


async def test_falls_back_to_home_when_no_visits(client):
    await register(client)
    await client.patch("/api/auth/me", json={"home_lat": 13.75, "home_lng": 100.5})
    # No visits yet: no crash, just an empty list without a Google key
    assert (await client.get("/api/places/suggest", params={"q": "x"})).json() == []


@pytest.mark.parametrize("limit", [1, 2])
async def test_limit_is_respected(client, db_sessionmaker, limit):
    await _seed_itinerary(client, db_sessionmaker)
    results = (
        await client.get("/api/places/suggest", params={"q": "", "limit": limit})
    ).json()
    assert len(results) == limit
