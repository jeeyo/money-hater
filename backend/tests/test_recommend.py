"""Suggestions for the trip you are on: only when open, cached, never invented."""

from datetime import UTC, datetime, time, timedelta

import pytest
import sqlalchemy as sa

import app.services.places as places_mod
import app.services.recommend as recommend_mod
from app.config import settings
from app.models import Place, TripRecommendation
from app.services.recommend import Recommendation, Recommendations
from tests.conftest import register
from tests.util import make_jpeg


@pytest.fixture(autouse=True)
def configured(monkeypatch):
    """Both keys present, so the endpoint gets past its 503 guards."""
    monkeypatch.setattr(settings, "llm_api_key", "sk-test")
    monkeypatch.setattr(settings, "google_maps_api_key", "gmk-test")
    monkeypatch.setattr(settings, "llm_model", "gpt-4.1-mini")

    # A configured key also switches on photo analysis, and these tests upload
    # photos to create stops. Skip that model call; this suite is about the
    # recommender's own agent, which each test stubs for itself.
    import app.services.analysis as analysis_mod

    async def no_vision(path, mime):
        return None

    monkeypatch.setattr(analysis_mod, "analyze_image_content", no_vision)


def _at(days_ago: int, hour: int = 0) -> str:
    day = (datetime.now(UTC) - timedelta(days=days_ago)).date()
    return datetime.combine(day, time(hour=hour), tzinfo=UTC).isoformat()


async def _expense(client, total: str, when: str, description: str = "") -> dict:
    response = await client.post(
        "/api/expenses",
        json={"total": total, "currency": "THB", "description": description, "spent_at": when},
    )
    assert response.status_code == 201, response.text
    return response.json()


async def _photo_stop(client, db_sessionmaker, lat: float, lng: float, hours_ago: int = 2):
    """A visit with coordinates — the anchor a recommendation starts from."""
    from app.services.analysis import run_image_analysis

    # Seed the place cache at those coordinates so resolving it doesn't reach
    # for Google (this suite sets a key, which would otherwise mean real calls).
    async with db_sessionmaker() as db:
        gid = f"seeded-{lat}-{lng}"
        if not await db.scalar(sa.select(Place).where(Place.google_place_id == gid)):
            db.add(_fake_place(gid, "A stop", lat, lng))
            await db.commit()

    taken = datetime.now() - timedelta(hours=hours_ago)
    created = (
        await client.post(
            "/api/images",
            files=[("files", ("a.jpg", make_jpeg(lat, lng, taken_at=taken), "image/jpeg"))],
        )
    ).json()
    async with db_sessionmaker() as db:
        await run_image_analysis(db, created[0]["id"])
    return created[0]


async def _open_trip(client, title: str = "Out and about") -> dict:
    # Started yesterday, not today. A trip's window opens at the *day* of its
    # first expense, while the stops below sit a few hours in the past — so run
    # this suite between midnight and 04:00 and a "four hours ago" stop lands on
    # yesterday, outside a trip that began at today's midnight, leaving the
    # recommender with nothing to anchor on. Yesterday always covers them.
    start = await _expense(client, "100", _at(1, hour=0), "First thing")
    response = await client.post(
        "/api/trips", json={"title": title, "start_expense_id": start["id"]}
    )
    assert response.status_code == 201, response.text
    return response.json()


def _fake_place(google_place_id: str, name: str, lat: float, lng: float) -> Place:
    return Place(
        google_place_id=google_place_id,
        name=name,
        formatted_address="Somewhere",
        lat=lat,
        lng=lng,
        types=["cafe"],
        raw={"rating": 4.5, "userRatingCount": 120, "currentOpeningHours": {"openNow": True}},
    )


def _stub_agent(monkeypatch, db_sessionmaker, items, *, offered=(("rec-1", "Kopi Corner"),)):
    """Replace the agent run: record the prompt, return `items` as its output.

    Also stubs the Places search the tool wraps, so `offered` is exactly the set
    of ids the model was given.
    """
    captured: dict = {}

    async def fake_search(db, anchor, kinds=None, keyword=None, radius_m=1500.0, limit=10):
        found = []
        for gid, name in offered:
            place = await db.scalar(sa.select(Place).where(Place.google_place_id == gid))
            if place is None:
                place = _fake_place(gid, name, anchor[0] + 0.002, anchor[1] + 0.002)
                db.add(place)
                await db.flush()
            found.append(place)
        return found

    monkeypatch.setattr(recommend_mod, "search_for_recommendations", fake_search)

    async def fake_run(agent, input):  # noqa: A002 - matches the SDK's signature
        from agents.tool_context import ToolContext

        captured["prompt"] = input
        captured["tools"] = [type(tool).__name__ for tool in agent.tools]
        # Call the tool the way the model would, so `offered` gets populated
        for tool in agent.tools:
            if getattr(tool, "name", "") == "find_places":
                args = '{"kinds": ["cafe"]}'
                context = ToolContext(
                    context=None,
                    tool_name="find_places",
                    tool_call_id="call-1",
                    tool_arguments=args,
                )
                captured["tool_result"] = await tool.on_invoke_tool(context, args)

        class Result:
            final_output = items

        return Result()

    monkeypatch.setattr("agents.Runner.run", fake_run)
    return captured


async def _run_pending_job(db_sessionmaker):
    async with db_sessionmaker() as db:
        row = await db.scalar(
            sa.select(TripRecommendation).where(TripRecommendation.status == "pending")
        )
        assert row is not None, "no pending recommendation to run"
        await recommend_mod.run_recommendation(db, row.id)


async def test_a_closed_trip_has_no_next_stop(client):
    await register(client)
    start = await _expense(client, "100", _at(2, hour=9))
    end = await _expense(client, "100", _at(1, hour=9))
    trip = (
        await client.post(
            "/api/trips",
            json={"title": "Done", "start_expense_id": start["id"], "end_expense_id": end["id"]},
        )
    ).json()

    response = await client.post(f"/api/trips/{trip['id']}/recommendations")
    assert response.status_code == 409
    assert "ended" in response.json()["detail"]


async def test_needs_a_stop_with_a_location(client):
    """Nothing to anchor on means nothing to be near."""
    await register(client)
    trip = await _open_trip(client)
    response = await client.post(f"/api/trips/{trip['id']}/recommendations")
    assert response.status_code == 422
    assert "location" in response.json()["detail"]


@pytest.mark.parametrize(
    ("setting", "value", "expected"),
    [("llm_api_key", "", "OPENAI_API_KEY"), ("google_maps_api_key", "", "GOOGLE_MAPS_API_KEY")],
)
async def test_unconfigured_is_refused_clearly(client, monkeypatch, setting, value, expected):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.setattr(settings, setting, value)
    await register(client)
    trip = await _open_trip(client)
    response = await client.post(f"/api/trips/{trip['id']}/recommendations")
    assert response.status_code == 503
    assert expected in response.json()["detail"]


async def test_generating_defers_a_job_rather_than_blocking_the_request(
    client, db_sessionmaker, in_memory_queue
):
    await register(client)
    await _photo_stop(client, db_sessionmaker, 13.7465, 100.4930)
    trip = await _open_trip(client)

    response = await client.post(f"/api/trips/{trip['id']}/recommendations")
    assert response.status_code == 202
    assert response.json()["status"] == "pending"

    jobs = [job for job in in_memory_queue.jobs.values() if job["task_name"] == "recommend_next"]
    assert len(jobs) == 1


async def test_the_prompt_carries_the_local_time_the_stops_and_the_spending(
    client, db_sessionmaker, monkeypatch
):
    """With no slot enum, the clock in the prompt is what steers the model."""
    await register(client)
    await _photo_stop(client, db_sessionmaker, 13.7465, 100.4930)
    trip = await _open_trip(client)
    await _expense(client, "425", _at(0, hour=1), "Tonkotsu ramen")

    captured = _stub_agent(
        monkeypatch,
        db_sessionmaker,
        Recommendations(
            moment="late afternoon",
            items=[
                Recommendation(
                    google_place_id="rec-1",
                    name="Kopi Corner",
                    category="coffee",
                    why="You started the day with coffee.",
                )
            ],
        ),
    )

    await client.post(
        f"/api/trips/{trip['id']}/recommendations", params={"tz_offset_minutes": 420}
    )
    await _run_pending_job(db_sessionmaker)

    prompt = captured["prompt"]
    local_now = datetime.now(UTC) + timedelta(minutes=420)
    assert f"{local_now:%A %d %B %Y}" in prompt
    assert f"{local_now:%H}" in prompt
    assert "Tonkotsu ramen" in prompt
    assert trip["title"] in prompt
    # Both tools are on the agent: hosted web search and our places lookup
    assert "WebSearchTool" in captured["tools"]


async def test_a_ready_set_is_stored_and_served(client, db_sessionmaker, monkeypatch):
    await register(client)
    await _photo_stop(client, db_sessionmaker, 13.7465, 100.4930)
    trip = await _open_trip(client)

    _stub_agent(
        monkeypatch,
        db_sessionmaker,
        Recommendations(
            moment="late afternoon",
            items=[
                Recommendation(
                    google_place_id="rec-1",
                    name="Kopi Corner",
                    category="coffee",
                    why="Two minutes from where you are.",
                    event="Night market on tonight",
                )
            ],
        ),
    )

    await client.post(f"/api/trips/{trip['id']}/recommendations")
    await _run_pending_job(db_sessionmaker)

    body = (await client.get(f"/api/trips/{trip['id']}/recommendations")).json()
    assert body["status"] == "ready"
    assert body["moment"] == "late afternoon"
    (card,) = body["items"]
    assert card["name"] == "Kopi Corner"
    assert card["why"].startswith("Two minutes")
    assert card["event"] == "Night market on tonight"
    assert card["rating"] == 4.5
    assert card["distance_m"] >= 0

    async with db_sessionmaker() as db:
        row = await db.scalar(sa.select(TripRecommendation))
        assert row.model == settings.llm_model


async def test_invented_places_are_dropped(client, db_sessionmaker, monkeypatch):
    """A confident hallucination sends the user walking to a place that isn't there."""
    await register(client)
    await _photo_stop(client, db_sessionmaker, 13.7465, 100.4930)
    trip = await _open_trip(client)

    _stub_agent(
        monkeypatch,
        db_sessionmaker,
        Recommendations(
            moment="evening",
            items=[
                Recommendation(
                    google_place_id="rec-1", name="Kopi Corner", category="coffee", why="Real."
                ),
                Recommendation(
                    google_place_id="totally-made-up",
                    name="The Hidden Rooftop",
                    category="bar",
                    why="Sounds plausible, does not exist.",
                ),
            ],
        ),
    )

    await client.post(f"/api/trips/{trip['id']}/recommendations")
    await _run_pending_job(db_sessionmaker)

    body = (await client.get(f"/api/trips/{trip['id']}/recommendations")).json()
    assert [item["name"] for item in body["items"]] == ["Kopi Corner"]


async def test_a_fresh_set_is_reused_instead_of_paying_again(
    client, db_sessionmaker, monkeypatch, in_memory_queue
):
    await register(client)
    await _photo_stop(client, db_sessionmaker, 13.7465, 100.4930)
    trip = await _open_trip(client)

    _stub_agent(
        monkeypatch,
        db_sessionmaker,
        Recommendations(
            moment="afternoon",
            items=[
                Recommendation(
                    google_place_id="rec-1", name="Kopi Corner", category="coffee", why="Close."
                )
            ],
        ),
    )
    await client.post(f"/api/trips/{trip['id']}/recommendations")
    await _run_pending_job(db_sessionmaker)

    before = len(in_memory_queue.jobs)
    again = await client.post(f"/api/trips/{trip['id']}/recommendations")
    assert again.status_code == 202
    assert again.json()["status"] == "ready"
    assert len(in_memory_queue.jobs) == before, "a cached set must not queue another run"


async def test_refresh_regenerates(client, db_sessionmaker, monkeypatch, in_memory_queue):
    await register(client)
    await _photo_stop(client, db_sessionmaker, 13.7465, 100.4930)
    trip = await _open_trip(client)

    _stub_agent(
        monkeypatch,
        db_sessionmaker,
        Recommendations(
            moment="afternoon",
            items=[
                Recommendation(
                    google_place_id="rec-1", name="Kopi Corner", category="coffee", why="Close."
                )
            ],
        ),
    )
    await client.post(f"/api/trips/{trip['id']}/recommendations")
    await _run_pending_job(db_sessionmaker)

    before = len(in_memory_queue.jobs)
    again = await client.post(f"/api/trips/{trip['id']}/recommendations", json={"refresh": True})
    assert again.json()["status"] == "pending"
    assert len(in_memory_queue.jobs) == before + 1


async def test_a_set_goes_stale_once_it_is_old(client, db_sessionmaker, monkeypatch):
    await register(client)
    await _photo_stop(client, db_sessionmaker, 13.7465, 100.4930)
    trip = await _open_trip(client)

    _stub_agent(
        monkeypatch,
        db_sessionmaker,
        Recommendations(
            moment="morning",
            items=[
                Recommendation(
                    google_place_id="rec-1", name="Kopi Corner", category="coffee", why="Close."
                )
            ],
        ),
    )
    await client.post(f"/api/trips/{trip['id']}/recommendations")
    await _run_pending_job(db_sessionmaker)

    async with db_sessionmaker() as db:
        row = await db.scalar(sa.select(TripRecommendation))
        row.generated_at = datetime.now(UTC) - timedelta(
            minutes=settings.recommendation_ttl_minutes + 5
        )
        await db.commit()

    body = (await client.get(f"/api/trips/{trip['id']}/recommendations")).json()
    assert body["status"] == "none", "breakfast suggestions must not still be up at dinner"


async def test_moving_on_invalidates_the_set(client, db_sessionmaker, monkeypatch):
    """A new stop is a new anchor, so the old suggestions are about the past."""
    await register(client)
    await _photo_stop(client, db_sessionmaker, 13.7465, 100.4930, hours_ago=4)
    trip = await _open_trip(client)

    _stub_agent(
        monkeypatch,
        db_sessionmaker,
        Recommendations(
            moment="afternoon",
            items=[
                Recommendation(
                    google_place_id="rec-1", name="Kopi Corner", category="coffee", why="Close."
                )
            ],
        ),
    )
    await client.post(f"/api/trips/{trip['id']}/recommendations")
    await _run_pending_job(db_sessionmaker)
    body = (await client.get(f"/api/trips/{trip['id']}/recommendations")).json()
    assert body["status"] == "ready"

    # Walk somewhere else entirely
    await _photo_stop(client, db_sessionmaker, 13.7563, 100.5018, hours_ago=1)
    body = (await client.get(f"/api/trips/{trip['id']}/recommendations")).json()
    assert body["status"] == "none"


async def test_a_failed_run_is_recorded_not_swallowed(client, db_sessionmaker, monkeypatch):
    await register(client)
    await _photo_stop(client, db_sessionmaker, 13.7465, 100.4930)
    trip = await _open_trip(client)

    async def boom(agent, input):  # noqa: A002 - matches the SDK's signature
        raise RuntimeError("model is down")

    monkeypatch.setattr("agents.Runner.run", boom)

    await client.post(f"/api/trips/{trip['id']}/recommendations")
    await _run_pending_job(db_sessionmaker)

    async with db_sessionmaker() as db:
        row = await db.scalar(sa.select(TripRecommendation))
        assert row.status == "failed"
        assert "model is down" in row.error


async def test_recommendations_are_user_scoped(client, db_sessionmaker):
    await register(client, email="alice@example.com")
    await _photo_stop(client, db_sessionmaker, 13.7465, 100.4930)
    trip = await _open_trip(client)

    await client.post("/api/auth/logout")
    await register(client, email="bob@example.com")
    assert (await client.get(f"/api/trips/{trip['id']}/recommendations")).status_code == 404
    assert (await client.post(f"/api/trips/{trip['id']}/recommendations")).status_code == 404


async def test_generation_never_buys_reviews(client, db_sessionmaker, monkeypatch):
    """Reviews are the priciest Google field; only an opened card pays for them."""
    await register(client)
    await _photo_stop(client, db_sessionmaker, 13.7465, 100.4930)
    trip = await _open_trip(client)

    called = False

    async def spy_details(db, google_place_id):
        nonlocal called
        called = True
        return None

    monkeypatch.setattr(places_mod, "place_details", spy_details)
    _stub_agent(
        monkeypatch,
        db_sessionmaker,
        Recommendations(
            moment="afternoon",
            items=[
                Recommendation(
                    google_place_id="rec-1", name="Kopi Corner", category="coffee", why="Close."
                )
            ],
        ),
    )

    await client.post(f"/api/trips/{trip['id']}/recommendations")
    await _run_pending_job(db_sessionmaker)
    await client.get(f"/api/trips/{trip['id']}/recommendations")
    assert called is False
