"""Suggest where to go next on the trip you are still on.

One agent run, given three things: where the last stop was, what the rest of
this trip has looked like, and what time it is locally. It has two tools — the
SDK's hosted web search, for what is actually on around here today, and a
Google Places lookup for real, nearby, open candidates.

The prompt does not encode any notion of meal times. It states the local date
and time and lets the model work out whether that means coffee, lunch, a temple
before it closes, or a night market, including which Google place types to ask
for.
"""

import logging
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import sqlalchemy as sa
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import Place, Trip, TripRecommendation, User, Visit
from app.services import trips as trip_service
from app.services.geo import haversine_m
from app.services.llm import prepare_sdk
from app.services.places import search_for_recommendations

log = logging.getLogger(__name__)

MAX_CANDIDATE_RADIUS_M = 4000.0


class Recommendation(BaseModel):
    google_place_id: str = Field(
        description="The place_id exactly as returned by find_places. Never invent one."
    )
    name: str
    category: str = Field(description="A short label for the card, e.g. 'coffee', 'night market'")
    why: str = Field(
        description="One or two sentences on why this fits, referring to this trip specifically"
    )
    event: str | None = Field(
        default=None,
        description="Anything on there today or tonight, if web search found something",
    )


class Recommendations(BaseModel):
    moment: str = Field(
        description="What this moment calls for, in a few words, e.g. 'late afternoon coffee'"
    )
    items: list[Recommendation]


INSTRUCTIONS = """You suggest where someone should go next, during a trip they are on right now.

You are told where they are, the stops they have already made on this trip, what
they have spent money on, and the local date and time.

Work out for yourself what this time of day calls for — nobody wants a cocktail
bar at 9am or a breakfast place at 10pm — and search for that. Use find_places to
get real candidates: pass the Google place types you think fit (for example
cafe, restaurant, bakery, bar, tourist_attraction, market, museum), or a keyword
when you want something specific. Use web_search for what is happening locally
on this date — festivals, night markets, temple fairs, exhibitions — and mention
it in `event` when a suggestion ties to one.

Rules:
- Every google_place_id MUST come from a find_places result. Never invent one,
  and never guess an id for a place you only read about on the web; look it up
  with find_places first.
- Do not suggest a place they have already been to on this trip.
- Prefer places within a short walk or ride of where they are now.
- Lean on what this trip shows they like: the kinds of places they chose, the
  sort of food they bought, what they spend.
- 3 to 5 suggestions. Make `why` concrete about this trip, not generic praise.
"""


@dataclass
class TripContext:
    """Everything the model is told about the trip, assembled from the DB."""

    anchor: tuple[float, float]
    anchor_visit: Visit | None
    anchor_label: str
    local_now: datetime
    day_number: int
    stops: list[str]
    spending: list[str]
    visited_place_ids: set[str]


def _local(moment: datetime, tz_offset_minutes: int) -> datetime:
    aware = moment if moment.tzinfo else moment.replace(tzinfo=UTC)
    return aware + timedelta(minutes=tz_offset_minutes)


async def build_context(
    db: AsyncSession, user: User, trip: Trip, tz_offset_minutes: int
) -> TripContext | None:
    """Gather the trip into the handful of lines the prompt needs."""
    from app.serialize import visit_label

    window = trip_service.window_of(trip, tz_offset_minutes)
    anchor_visit = await trip_service.latest_visit_in(db, user, window)
    if anchor_visit is None or anchor_visit.lat is None:
        return None

    visits = await trip_service.visits_in(db, user, window)
    expenses = await trip_service.expenses_in(db, user, window)
    local_now = _local(datetime.now(UTC), tz_offset_minutes)

    stops = [
        f"{_local(visit.started_at, tz_offset_minutes):%a %H:%M} — {visit_label(visit)}"
        + (f" ({', '.join((visit.place.types or [])[:3])})" if visit.place else "")
        for visit in visits
    ]
    spending = [
        f"{expense.description or expense.merchant}"
        f" ({expense.currency} {expense.total_minor / 100:.0f})"
        for expense in expenses
        if expense.description or expense.merchant
    ]
    visited_place_ids = {
        visit.place.google_place_id for visit in visits if visit.place is not None
    }

    first_day = _local(window.started_at, tz_offset_minutes).date()
    return TripContext(
        anchor=(anchor_visit.lat, anchor_visit.lng),
        anchor_visit=anchor_visit,
        anchor_label=visit_label(anchor_visit),
        local_now=local_now,
        day_number=(local_now.date() - first_day).days + 1,
        stops=stops[-12:],
        spending=spending[-12:],
        visited_place_ids=visited_place_ids,
    )


def _prompt(trip: Trip, context: TripContext) -> str:
    stops = "\n".join(f"- {line}" for line in context.stops) or "- (nothing logged yet)"
    spending = "\n".join(f"- {line}" for line in context.spending) or "- (nothing yet)"
    return (
        f"Trip: “{trip.title}”, day {context.day_number}, still going.\n"
        f"Local date and time right now: {context.local_now:%A %d %B %Y, %H:%M}.\n"
        f"They are at: {context.anchor_label} "
        f"({context.anchor[0]:.5f}, {context.anchor[1]:.5f}).\n\n"
        f"Stops so far on this trip:\n{stops}\n\n"
        f"Spending so far:\n{spending}\n\n"
        "Suggest where to go next."
    )


def _candidate_payload(place: Place, anchor: tuple[float, float]) -> dict:
    raw = place.raw or {}
    return {
        "place_id": place.google_place_id,
        "name": place.name,
        "address": place.formatted_address,
        "types": place.types,
        "rating": raw.get("rating"),
        "user_rating_count": raw.get("userRatingCount"),
        "price_level": raw.get("priceLevel"),
        "open_now": (raw.get("currentOpeningHours") or {}).get("openNow"),
        "distance_m": round(haversine_m(anchor[0], anchor[1], place.lat, place.lng)),
    }


async def generate(
    db: AsyncSession, trip: Trip, context: TripContext
) -> tuple[Recommendations, dict[str, Place]]:
    """Run the agent. Raises on model failure; the job records that."""
    # Imported lazily so the app runs without a key (and tests never touch it)
    from agents import Agent, Runner, WebSearchTool, function_tool

    prepare_sdk()

    # Every id the model is allowed to name, collected as the tool hands them out
    offered: dict[str, Place] = {}

    @function_tool
    async def find_places(
        kinds: list[str] | None = None,
        keyword: str | None = None,
        radius_m: int = 1500,
    ) -> list[dict]:
        """Find real places near the traveller.

        Args:
            kinds: Google place types to include, e.g. ["cafe", "bakery"].
            keyword: free text when you want something specific, e.g. "mango sticky rice".
            radius_m: how far to look, in metres.
        """
        found = await search_for_recommendations(
            db,
            anchor=context.anchor,
            kinds=kinds,
            keyword=keyword,
            radius_m=min(float(radius_m), MAX_CANDIDATE_RADIUS_M),
        )
        payload = []
        for place in found:
            if place.google_place_id in context.visited_place_ids:
                continue  # already been there on this trip
            offered[place.google_place_id] = place
            payload.append(_candidate_payload(place, context.anchor))
        return payload

    agent = Agent(
        name="next-stop",
        instructions=INSTRUCTIONS,
        model=settings.llm_model,
        tools=[
            WebSearchTool(
                user_location={
                    "type": "approximate",
                    "latitude": context.anchor[0],
                    "longitude": context.anchor[1],
                }
            ),
            find_places,
        ],
        output_type=Recommendations,
    )
    result = await Runner.run(agent, input=_prompt(trip, context))
    return result.final_output, offered


def validate(result: Recommendations, offered: dict[str, Place]) -> list[Recommendation]:
    """Drop anything the tools never actually offered.

    A confidently invented restaurant is worse than one fewer suggestion,
    because the user walks there.
    """
    kept = []
    for item in result.items:
        if item.google_place_id in offered:
            kept.append(item)
        else:
            log.warning("Dropping recommendation with unknown place_id: %s", item.name)
    return kept


def _card(item: Recommendation, place: Place, anchor: tuple[float, float]) -> dict:
    raw = place.raw or {}
    return {
        "google_place_id": place.google_place_id,
        "name": place.name,
        "category": item.category,
        "why": item.why,
        "event": item.event,
        "address": place.formatted_address,
        "lat": place.lat,
        "lng": place.lng,
        "rating": raw.get("rating"),
        "user_rating_count": raw.get("userRatingCount"),
        "price_level": raw.get("priceLevel"),
        "open_now": (raw.get("currentOpeningHours") or {}).get("openNow"),
        "distance_m": round(haversine_m(anchor[0], anchor[1], place.lat, place.lng)),
    }


async def within_daily_cap(db: AsyncSession, user: User) -> bool:
    if settings.daily_recommendation_cap <= 0:
        return True
    day_start = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
    used = await db.scalar(
        sa.select(sa.func.count())
        .select_from(TripRecommendation)
        .where(
            TripRecommendation.user_id == user.id,
            TripRecommendation.generated_at >= day_start,
        )
    )
    return (used or 0) < settings.daily_recommendation_cap


def is_fresh(row: TripRecommendation, anchor_visit_id: int | None, now: datetime) -> bool:
    """Still worth showing without spending another model call?"""
    if row.status == "failed":
        return False
    if row.anchor_visit_id != anchor_visit_id:
        return False  # they have moved on since
    generated = row.generated_at
    if generated is None:
        return False
    if generated.tzinfo is None:
        generated = generated.replace(tzinfo=UTC)  # sqlite hands back naive datetimes
    if row.status == "pending":
        return True  # a job is in flight; the UI polls it
    return generated >= now - timedelta(minutes=settings.recommendation_ttl_minutes)


async def newest_for_trip(db: AsyncSession, trip_id: int) -> TripRecommendation | None:
    return await db.scalar(
        sa.select(TripRecommendation)
        .where(TripRecommendation.trip_id == trip_id)
        .order_by(TripRecommendation.generated_at.desc(), TripRecommendation.id.desc())
        .limit(1)
    )


async def run_recommendation(db: AsyncSession, recommendation_id: int) -> None:
    """The job body: fill in a pending row, or mark it failed."""
    row = await db.get(TripRecommendation, recommendation_id)
    if row is None:
        return
    user = await db.get(User, row.user_id)
    trip = await trip_service.load_trip(db, user, row.trip_id) if user else None
    if trip is None:
        row.status = "failed"
        row.error = "Trip is gone"
        await db.commit()
        return

    try:
        # The browser's offset is recorded on the row: the worker has no idea
        # what "6pm, local" means otherwise, and that is the whole prompt.
        context = await build_context(db, user, trip, row.tz_offset_minutes)
        if context is None:
            raise ValueError("No stop with coordinates to start from")
        result, offered = await generate(db, trip, context)
        kept = validate(result, offered)
        row.moment = result.moment
        row.items = [_card(item, offered[item.google_place_id], context.anchor) for item in kept]
        row.model = settings.llm_model
        row.status = "ready"
        row.error = None
    except Exception as exc:  # noqa: BLE001 - a failed suggestion must not crash the worker
        log.exception("recommendation %s failed", recommendation_id)
        row.status = "failed"
        row.error = str(exc)[:1000]
    row.generated_at = datetime.now(UTC)
    await db.commit()
