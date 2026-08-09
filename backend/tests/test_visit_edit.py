"""Correcting a stop by hand: naming it, or pointing it at a real place."""

from datetime import UTC, datetime

import sqlalchemy as sa

import app.routers.trips as trips_router
from app.models import Image, Place, Visit
from app.services.analysis import run_image_analysis
from tests.conftest import register
from tests.util import make_jpeg

BKK = (13.7563, 100.5018)


async def _a_stop(client, db_sessionmaker) -> int:
    created = (
        await client.post(
            "/api/images",
            files=[
                (
                    "files",
                    ("a.jpg", make_jpeg(*BKK, taken_at=datetime(2026, 8, 8, 12, 0)), "image/jpeg"),
                )
            ],
        )
    ).json()
    async with db_sessionmaker() as db:
        await run_image_analysis(db, created[0]["id"])
        visit = await db.scalar(sa.select(Visit))
        return visit.id


async def test_naming_a_stop_needs_no_api_key(client, db_sessionmaker):
    """The only correction available on a keyless install."""
    await register(client)
    visit_id = await _a_stop(client, db_sessionmaker)

    response = await client.patch(
        f"/api/visits/{visit_id}", json={"label_override": "Grandma's kitchen"}
    )
    assert response.status_code == 200, response.text
    assert response.json()["label"] == "Grandma's kitchen"


async def test_a_named_stop_survives_reclustering(client, db_sessionmaker):
    """Editing pins the visit, so the next upload cannot rebuild the name away."""
    await register(client)
    visit_id = await _a_stop(client, db_sessionmaker)
    await client.patch(f"/api/visits/{visit_id}", json={"label_override": "Grandma's kitchen"})

    created = (
        await client.post(
            "/api/images",
            files=[
                (
                    "files",
                    (
                        "b.jpg",
                        make_jpeg(*BKK, taken_at=datetime(2026, 8, 8, 12, 10), color=(9, 8, 7)),
                        "image/jpeg",
                    ),
                )
            ],
        )
    ).json()
    async with db_sessionmaker() as db:
        await run_image_analysis(db, created[0]["id"])
        visit = await db.get(Visit, visit_id)
        assert visit is not None and visit.label_override == "Grandma's kitchen"
        assert visit.pinned is True


async def test_place_query_is_searched_as_text(client, db_sessionmaker, monkeypatch):
    """`place_query` is what you would type, not an opaque Google id.

    It was called `google_place_id`, which invited callers to send a `ChIJ…`
    id — that would have been searched for as a literal string and found
    nothing.
    """
    await register(client)
    visit_id = await _a_stop(client, db_sessionmaker)

    seen: dict = {}

    async def fake_search(db, query):
        seen["query"] = query
        place = Place(
            google_place_id="ChIJ-real-id",
            name="Menya Itto",
            lat=BKK[0],
            lng=BKK[1],
            types=["restaurant"],
        )
        db.add(place)
        await db.flush()
        return place

    monkeypatch.setattr(trips_router, "search_place_by_text", fake_search)

    response = await client.patch(f"/api/visits/{visit_id}", json={"place_query": "Menya Itto"})
    assert response.status_code == 200, response.text
    assert seen["query"] == "Menya Itto"
    assert response.json()["label"] == "Menya Itto"


async def test_a_place_that_cannot_be_found_is_a_404(client, db_sessionmaker, monkeypatch):
    await register(client)
    visit_id = await _a_stop(client, db_sessionmaker)

    async def no_match(db, query):
        return None

    monkeypatch.setattr(trips_router, "search_place_by_text", no_match)
    response = await client.patch(f"/api/visits/{visit_id}", json={"place_query": "nowhere at all"})
    assert response.status_code == 404


async def test_editing_someone_elses_stop_is_a_404(client, db_sessionmaker):
    await register(client, email="alice@example.com")
    visit_id = await _a_stop(client, db_sessionmaker)

    await client.post("/api/auth/logout")
    await register(client, email="bob@example.com")
    response = await client.patch(f"/api/visits/{visit_id}", json={"label_override": "mine now"})
    assert response.status_code == 404


async def test_a_photo_can_be_moved_to_another_stop(client, db_sessionmaker):
    """The fix for a photo that landed on the wrong stop."""
    await register(client)
    ids = []
    # Hours apart, so they cluster into two separate stops to move between
    for hour, color in [(9, (1, 2, 3)), (15, (4, 5, 6))]:
        created = (
            await client.post(
                "/api/images",
                files=[
                    (
                        "files",
                        (
                            f"{hour}.jpg",
                            make_jpeg(
                                *BKK,
                                taken_at=datetime(2026, 8, 8, hour, 0, tzinfo=UTC),
                                color=color,
                            ),
                            "image/jpeg",
                        ),
                    )
                ],
            )
        ).json()
        ids.append(created[0]["id"])
        async with db_sessionmaker() as db:
            await run_image_analysis(db, created[0]["id"])

    async with db_sessionmaker() as db:
        visits = (await db.execute(sa.select(Visit).order_by(Visit.started_at))).scalars().all()
        assert len(visits) == 2, "the fixture needs two stops for the move to mean anything"
        morning, afternoon = visits[0].id, visits[1].id
        assert (await db.get(Image, ids[1])).visit_id == afternoon

    response = await client.post(f"/api/images/{ids[1]}/assign", json={"visit_id": morning})
    assert response.status_code == 200, response.text

    async with db_sessionmaker() as db:
        assert (await db.get(Image, ids[1])).visit_id == morning
        assert (await db.get(Visit, morning)).pinned is True, "a move must survive re-clustering"
