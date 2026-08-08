"""Resolve GPS coordinates to a named place.

Uses Google Places API (New) Nearby Search when GOOGLE_MAPS_API_KEY is set,
with an aggressive Postgres cache (by place_id, and by proximity so nearby
photos don't re-query Google). Without a key, resolution is skipped and the
UI shows raw coordinates.
"""

import logging
from datetime import UTC, datetime, timedelta

import httpx
import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import Place, User, Visit
from app.services.geo import haversine_m

log = logging.getLogger(__name__)

NEARBY_URL = "https://places.googleapis.com/v1/places:searchNearby"
TEXT_URL = "https://places.googleapis.com/v1/places:searchText"
DETAILS_URL = "https://places.googleapis.com/v1/places/{place_id}"
FIELD_MASK = "places.id,places.displayName,places.formattedAddress,places.location,places.types"

# Recommendations need to tell a good place from a bad one, so they ask for
# ratings and price. Deliberately a separate mask: FIELD_MASK above is used by
# the keystroke-driven suggest endpoint, and these extra fields move a call into
# a pricier Google SKU — one worth paying a few times an afternoon, not once
# per character typed.
RECOMMEND_FIELD_MASK = (
    FIELD_MASK
    + ",places.rating,places.userRatingCount,places.priceLevel"
    + ",places.currentOpeningHours.openNow,places.googleMapsUri,places.editorialSummary"
)
# Reviews are Google's most expensive field group, so they are fetched for one
# place at a time, only when the user opens a card.
DETAILS_FIELD_MASK = (
    "id,displayName,formattedAddress,location,types,rating,userRatingCount,priceLevel"
    ",currentOpeningHours.openNow,currentOpeningHours.weekdayDescriptions"
    ",googleMapsUri,websiteUri,editorialSummary,reviews"
)
DETAILS_TTL_HOURS = 24

SEARCH_RADIUS_M = 150.0
# Reuse a cached place if it's within this distance of the photo
CACHE_RADIUS_M = 120.0
# Suggestions are biased to, not restricted to, this radius around the user
SUGGEST_BIAS_RADIUS_M = 3000.0
# Shortest query worth sending to Google
MIN_QUERY_FOR_GOOGLE = 2

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


async def anchor_for_time(
    db: AsyncSession, user: User, at: datetime | None
) -> tuple[float, float] | None:
    """Where the user was around `at` — the bias point for place suggestions.

    Prefers the visit covering that moment, then the nearest visit in time,
    then their home location. Returns None if we know none of those.
    """
    if at is not None:
        covering = await db.execute(
            sa.select(Visit.lat, Visit.lng)
            .where(
                Visit.user_id == user.id,
                Visit.started_at <= at,
                Visit.ended_at >= at,
                Visit.lat.isnot(None),
            )
            .limit(1)
        )
        row = covering.first()
        if row:
            return row.lat, row.lng

        # Nearest visit in time, so an expense logged between stops still
        # suggests places from that part of the day
        gap = sa.func.abs(
            sa.extract("epoch", Visit.started_at) - sa.extract("epoch", at)
        )
        nearest = await db.execute(
            sa.select(Visit.lat, Visit.lng)
            .where(Visit.user_id == user.id, Visit.lat.isnot(None))
            .order_by(gap)
            .limit(1)
        )
        row = nearest.first()
        if row:
            return row.lat, row.lng

    if user.home_lat is not None and user.home_lng is not None:
        return user.home_lat, user.home_lng
    return None


async def _visited_places(db: AsyncSession, user: User) -> list[Place]:
    """Places already on this user's itinerary — free to search, no API call."""
    result = await db.execute(
        sa.select(Place)
        .join(Visit, Visit.place_id == Place.id)
        .where(Visit.user_id == user.id)
        .distinct()
    )
    return list(result.scalars())


async def _google_text_search(
    query: str, anchor: tuple[float, float] | None, limit: int
) -> list[dict]:
    if not settings.google_maps_api_key:
        return []
    body: dict = {"textQuery": query, "maxResultCount": limit}
    if anchor is not None:
        body["locationBias"] = {
            "circle": {
                "center": {"latitude": anchor[0], "longitude": anchor[1]},
                "radius": SUGGEST_BIAS_RADIUS_M,
            }
        }
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(
                TEXT_URL,
                json=body,
                headers={
                    "X-Goog-Api-Key": settings.google_maps_api_key,
                    "X-Goog-FieldMask": FIELD_MASK,
                },
            )
            response.raise_for_status()
            return response.json().get("places", [])
    except httpx.HTTPError as exc:
        log.warning("Places suggest failed: %s", exc)
        return []


async def suggest_places(
    db: AsyncSession,
    user: User,
    query: str,
    at: datetime | None = None,
    limit: int = 8,
) -> list[tuple[Place, float | None, str]]:
    """Suggest places for a query, biased to where the user was at `at`.

    Returns (place, distance_from_anchor_m, source) with places already on the
    itinerary first — those cost nothing and are what people usually mean.
    Google is only consulted when the local list is thin, which keeps the
    keystroke-driven UI off the billing meter.
    """
    anchor = await anchor_for_time(db, user, at)
    needle = query.strip().lower()

    def distance(place: Place) -> float | None:
        if anchor is None:
            return None
        return haversine_m(anchor[0], anchor[1], place.lat, place.lng)

    local = [
        place
        for place in await _visited_places(db, user)
        if not needle or needle in place.name.lower()
    ]
    local.sort(key=lambda p: (distance(p) if anchor else 0) or 0)
    results: list[tuple[Place, float | None, str]] = [
        (place, distance(place), "visited") for place in local[:limit]
    ]

    # Google is the fallback, not the default: the "where" of an expense is
    # almost always somewhere already on the itinerary, and this endpoint is
    # driven by keystrokes.
    if results or len(needle) < MIN_QUERY_FOR_GOOGLE:
        return results[:limit]

    seen = {place.google_place_id for place, _, _ in results}
    for item in await _google_text_search(query, anchor, limit - len(results)):
        if item.get("id") in seen:
            continue
        place = await _upsert_place(db, item)
        if place is not None:
            results.append((place, distance(place), "google"))
    return results[:limit]


async def search_for_recommendations(
    db: AsyncSession,
    anchor: tuple[float, float],
    kinds: list[str] | None = None,
    keyword: str | None = None,
    radius_m: float = 1500.0,
    limit: int = 10,
) -> list[Place]:
    """Candidate places near the user, for the recommender's tool to offer.

    A keyword goes to text search ("dessert cafe"), bare types to nearby search.
    Everything found is cached as a `Place`, so a recommendation the user acts
    on is already a row we can attach an expense to.
    """
    if not settings.google_maps_api_key:
        return []
    lat, lng = anchor
    circle = {"center": {"latitude": lat, "longitude": lng}, "radius": radius_m}
    if keyword:
        url = TEXT_URL
        body: dict = {
            "textQuery": keyword,
            "maxResultCount": limit,
            "locationBias": {"circle": circle},
        }
        if kinds:
            # Text search takes one type, not a list
            body["includedType"] = kinds[0]
    else:
        url = NEARBY_URL
        body = {
            "maxResultCount": limit,
            "rankPreference": "POPULARITY",
            "locationRestriction": {"circle": circle},
        }
        if kinds:
            body["includedTypes"] = kinds

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(
                url,
                json=body,
                headers={
                    "X-Goog-Api-Key": settings.google_maps_api_key,
                    "X-Goog-FieldMask": RECOMMEND_FIELD_MASK,
                },
            )
            response.raise_for_status()
            items = response.json().get("places", [])
    except httpx.HTTPError as exc:
        # A bad type name from the model lands here as a 400; an empty list
        # tells it to try something else rather than failing the whole run.
        log.warning("Places recommendation search failed: %s", exc)
        return []

    found: list[Place] = []
    for item in items:
        place = await _upsert_place(db, item)
        if place is not None:
            found.append(place)
    return found


def _details_are_fresh(place: Place, now: datetime) -> bool:
    """Cached details still usable? Ratings and reviews drift slowly."""
    raw = place.raw or {}
    if "reviews" not in raw:
        return False
    fetched = place.fetched_at
    if fetched is None:
        return False
    if fetched.tzinfo is None:
        fetched = fetched.replace(tzinfo=UTC)  # sqlite hands back naive datetimes
    return fetched >= now - timedelta(hours=DETAILS_TTL_HOURS)


async def place_details(db: AsyncSession, google_place_id: str) -> Place | None:
    """Full detail for one place, including recent reviews.

    Cached in `Place.raw` — this is what `Place.fetched_at` is for. Called when
    a recommendation card is opened, never for a whole list of candidates.
    """
    place = await db.scalar(sa.select(Place).where(Place.google_place_id == google_place_id))
    now = datetime.now(UTC)
    if place is not None and _details_are_fresh(place, now):
        return place
    if not settings.google_maps_api_key:
        return place  # whatever we already know beats nothing

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.get(
                DETAILS_URL.format(place_id=google_place_id),
                headers={
                    "X-Goog-Api-Key": settings.google_maps_api_key,
                    "X-Goog-FieldMask": DETAILS_FIELD_MASK,
                },
            )
            response.raise_for_status()
            item = response.json()
    except httpx.HTTPError as exc:
        log.warning("Place details failed for %s: %s", google_place_id, exc)
        return place

    if place is None:
        return await _upsert_place(db, item)
    place.raw = item
    place.fetched_at = now
    await db.flush()
    return place


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
