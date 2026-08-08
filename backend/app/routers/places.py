from datetime import datetime

from fastapi import APIRouter, Query

from app.deps import CurrentUser, DbSession
from app.schemas import PlaceSuggestion
from app.services.places import suggest_places

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
