"""Resolve GPS coordinates to a named place.

Uses Google Places API (New) Nearby Search when GOOGLE_MAPS_API_KEY is set,
with an aggressive Postgres cache (by place_id, and by proximity so nearby
photos don't re-query Google). Without a key, resolution is skipped and the
UI shows raw coordinates.
"""

import logging

import httpx
import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import Place
from app.services.geo import haversine_m

log = logging.getLogger(__name__)

NEARBY_URL = "https://places.googleapis.com/v1/places:searchNearby"
TEXT_URL = "https://places.googleapis.com/v1/places:searchText"
FIELD_MASK = "places.id,places.displayName,places.formattedAddress,places.location,places.types"
SEARCH_RADIUS_M = 150.0
# Reuse a cached place if it's within this distance of the photo
CACHE_RADIUS_M = 120.0

# Vision hints -> preferred Google place types, used to pick a better candidate
# (a food photo near both a park and a restaurant should pick the restaurant)
HINT_TYPES = {
    "food": {"restaurant", "cafe", "bakery", "bar", "meal_takeaway", "food"},
    "receipt": {"restaurant", "cafe", "store", "supermarket", "shopping_mall"},
    "item": {"store", "supermarket", "shopping_mall", "clothing_store"},
}


async def _cached_nearby(db: AsyncSession, lat: float, lng: float) -> Place | None:
    # ~0.002 deg is roughly 200m; coarse box filter, exact haversine check after
    box = 0.002
    result = await db.execute(
        sa.select(Place).where(
            Place.lat.between(lat - box, lat + box),
            Place.lng.between(lng - box, lng + box),
        )
    )
    best: Place | None = None
    best_d = CACHE_RADIUS_M
    for place in result.scalars():
        d = haversine_m(lat, lng, place.lat, place.lng)
        if d <= best_d:
            best, best_d = place, d
    return best


async def _upsert_place(db: AsyncSession, item: dict) -> Place | None:
    google_id = item.get("id")
    location = item.get("location") or {}
    name = (item.get("displayName") or {}).get("text")
    if not google_id or not name or "latitude" not in location:
        return None
    existing = await db.scalar(sa.select(Place).where(Place.google_place_id == google_id))
    if existing:
        return existing
    place = Place(
        google_place_id=google_id,
        name=name,
        formatted_address=item.get("formattedAddress"),
        lat=location["latitude"],
        lng=location["longitude"],
        types=item.get("types"),
        raw=item,
    )
    db.add(place)
    await db.flush()
    return place


def _pick_candidate(items: list[dict], hint: str | None) -> dict | None:
    if not items:
        return None
    preferred = HINT_TYPES.get(hint or "", set())
    if preferred:
        for item in items:
            if preferred & set(item.get("types") or []):
                return item
    return items[0]


async def resolve_place(
    db: AsyncSession, lat: float, lng: float, hint: str | None = None
) -> Place | None:
    cached = await _cached_nearby(db, lat, lng)
    if cached is not None:
        return cached
    if not settings.google_maps_api_key:
        return None
    body = {
        "maxResultCount": 5,
        "rankPreference": "DISTANCE",
        "locationRestriction": {
            "circle": {
                "center": {"latitude": lat, "longitude": lng},
                "radius": SEARCH_RADIUS_M,
            }
        },
    }
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(
                NEARBY_URL,
                json=body,
                headers={
                    "X-Goog-Api-Key": settings.google_maps_api_key,
                    "X-Goog-FieldMask": FIELD_MASK,
                },
            )
            response.raise_for_status()
            items = response.json().get("places", [])
    except httpx.HTTPError as exc:
        log.warning("Places nearby search failed: %s", exc)
        return None
    candidate = _pick_candidate(items, hint)
    return await _upsert_place(db, candidate) if candidate else None


async def search_place_by_text(db: AsyncSession, query: str) -> Place | None:
    """Used when the user corrects a visit's place manually."""
    if not settings.google_maps_api_key:
        return None
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(
                TEXT_URL,
                json={"textQuery": query, "maxResultCount": 1},
                headers={
                    "X-Goog-Api-Key": settings.google_maps_api_key,
                    "X-Goog-FieldMask": FIELD_MASK,
                },
            )
            response.raise_for_status()
            items = response.json().get("places", [])
    except httpx.HTTPError as exc:
        log.warning("Places text search failed: %s", exc)
        return None
    return await _upsert_place(db, items[0]) if items else None
