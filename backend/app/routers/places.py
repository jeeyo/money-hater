from datetime import datetime

from fastapi import APIRouter, HTTPException, Query, status

from app.deps import CurrentUser, DbSession
from app.schemas import PlaceDetailsOut, PlaceReview, PlaceSuggestion
from app.services.places import place_details, suggest_places

router = APIRouter(prefix="/places", tags=["places"])


@router.get("/suggest", response_model=list[PlaceSuggestion])
async def suggest(
    user: CurrentUser,
    db: DbSession,
    q: str = Query(default="", max_length=120),
    at: datetime | None = Query(
        default=None, description="When the money was spent; biases results to where you were"
    ),
    limit: int = Query(default=8, ge=1, le=20),
):
    results = await suggest_places(db, user, q, at=at, limit=limit)
    await db.commit()  # persist any places newly cached from Google
    return [
        PlaceSuggestion(
            id=place.id,
            name=place.name,
            formatted_address=place.formatted_address,
            lat=place.lat,
            lng=place.lng,
            types=place.types,
            distance_m=round(distance) if distance is not None else None,
            source=source,
        )
        for place, distance, source in results
    ]


def _reviews(raw: dict) -> list[PlaceReview]:
    out = []
    for review in (raw.get("reviews") or [])[:5]:
        text = (review.get("text") or {}).get("text") or (
            review.get("originalText") or {}
        ).get("text")
        if not text:
            continue
        out.append(
            PlaceReview(
                author=(review.get("authorAttribution") or {}).get("displayName"),
                rating=review.get("rating"),
                text=text,
                relative_time=review.get("relativePublishTimeDescription"),
            )
        )
    return out


@router.get("/{google_place_id}/details", response_model=PlaceDetailsOut)
async def details(google_place_id: str, user: CurrentUser, db: DbSession):
    """Ratings, hours and recent comments for one place.

    Split out from the recommendation payload on purpose: reviews are Google's
    priciest field group, so they are bought for the card the user opened and
    not for every candidate the model looked at.
    """
    place = await place_details(db, google_place_id)
    if place is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Place not found")
    await db.commit()  # persist anything newly cached from Google
    raw = place.raw or {}
    hours = (raw.get("currentOpeningHours") or {}).get("weekdayDescriptions")
    return PlaceDetailsOut(
        id=place.id,
        google_place_id=place.google_place_id,
        name=place.name,
        formatted_address=place.formatted_address,
        lat=place.lat,
        lng=place.lng,
        types=place.types,
        rating=raw.get("rating"),
        user_rating_count=raw.get("userRatingCount"),
        price_level=raw.get("priceLevel"),
        open_now=(raw.get("currentOpeningHours") or {}).get("openNow"),
        opening_hours=hours,
        summary=(raw.get("editorialSummary") or {}).get("text"),
        website=raw.get("websiteUri"),
        maps_uri=raw.get("googleMapsUri"),
        reviews=_reviews(raw),
    )
