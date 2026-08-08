"""Ratings and comments for one place, bought only when a card is opened."""

from datetime import UTC, datetime, timedelta

import pytest
import sqlalchemy as sa

import app.services.places as places_mod
from app.config import settings
from app.models import Place
from tests.conftest import register

GOOGLE_REPLY = {
    "id": "place-xyz",
    "displayName": {"text": "Kopi Corner"},
    "formattedAddress": "12 Some Road",
    "location": {"latitude": 13.75, "longitude": 100.5},
    "types": ["cafe"],
    "rating": 4.6,
    "userRatingCount": 431,
    "priceLevel": "PRICE_LEVEL_INEXPENSIVE",
    "currentOpeningHours": {"openNow": True, "weekdayDescriptions": ["Monday: 8-6"]},
    "googleMapsUri": "https://maps.google.com/?cid=1",
    "editorialSummary": {"text": "Third-wave coffee bar."},
    "reviews": [
        {
            "authorAttribution": {"displayName": "Nok P."},
            "rating": 5,
            "text": {"text": "Excellent filter coffee."},
            "relativePublishTimeDescription": "2 weeks ago",
        },
        {"rating": 4, "originalText": {"text": "Busy but quick."}},
    ],
}


@pytest.fixture
def google(monkeypatch):
    """Stub the one network call, and count it."""
    monkeypatch.setattr(settings, "google_maps_api_key", "gmk-test")
    calls = {"n": 0}

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return GOOGLE_REPLY

    class FakeClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        async def get(self, url, headers=None):
            calls["n"] += 1
            calls["mask"] = (headers or {}).get("X-Goog-FieldMask", "")
            return FakeResponse()

    monkeypatch.setattr(places_mod.httpx, "AsyncClient", lambda **kw: FakeClient())
    return calls


async def test_details_include_rating_hours_and_comments(client, google):
    await register(client)
    body = (await client.get("/api/places/place-xyz/details")).json()

    assert body["name"] == "Kopi Corner"
    assert body["rating"] == 4.6
    assert body["user_rating_count"] == 431
    assert body["open_now"] is True
    assert body["opening_hours"] == ["Monday: 8-6"]
    assert body["summary"] == "Third-wave coffee bar."
    assert [review["text"] for review in body["reviews"]] == [
        "Excellent filter coffee.",
        "Busy but quick.",
    ]
    assert body["reviews"][0]["author"] == "Nok P."
    # Reviews are only in this mask, never the one the suggest endpoint uses
    assert "reviews" in google["mask"]
    assert "reviews" not in places_mod.FIELD_MASK


async def test_the_second_open_is_free(client, google, db_sessionmaker):
    """Cached in Place.raw — which is what Place.fetched_at was always for."""
    await register(client)
    await client.get("/api/places/place-xyz/details")
    assert google["n"] == 1

    body = (await client.get("/api/places/place-xyz/details")).json()
    assert google["n"] == 1, "a cached place must not be bought twice"
    assert body["rating"] == 4.6

    async with db_sessionmaker() as db:
        place = await db.scalar(sa.select(Place).where(Place.google_place_id == "place-xyz"))
        assert "reviews" in (place.raw or {})


async def test_stale_details_are_refetched(client, google, db_sessionmaker):
    await register(client)
    await client.get("/api/places/place-xyz/details")

    async with db_sessionmaker() as db:
        place = await db.scalar(sa.select(Place).where(Place.google_place_id == "place-xyz"))
        place.fetched_at = datetime.now(UTC) - timedelta(
            hours=places_mod.DETAILS_TTL_HOURS + 1
        )
        await db.commit()

    await client.get("/api/places/place-xyz/details")
    assert google["n"] == 2


async def test_a_known_place_is_served_without_a_key(client, monkeypatch, db_sessionmaker):
    """No key: show what the itinerary already knows rather than 404."""
    monkeypatch.setattr(settings, "google_maps_api_key", "")
    await register(client)
    async with db_sessionmaker() as db:
        db.add(
            Place(
                google_place_id="local-1",
                name="Somewhere Known",
                lat=13.7,
                lng=100.5,
                types=["cafe"],
            )
        )
        await db.commit()

    body = (await client.get("/api/places/local-1/details")).json()
    assert body["name"] == "Somewhere Known"
    assert body["reviews"] == []


async def test_an_unknown_place_without_a_key_is_a_404(client, monkeypatch):
    monkeypatch.setattr(settings, "google_maps_api_key", "")
    await register(client)
    assert (await client.get("/api/places/nope/details")).status_code == 404


async def test_details_need_a_login(client):
    assert (await client.get("/api/places/place-xyz/details")).status_code == 401
