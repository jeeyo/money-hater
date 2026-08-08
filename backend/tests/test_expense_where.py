"""The What/Where split on expenses."""

import sqlalchemy as sa

from app.models import Place
from tests.conftest import register


async def _make_place(db_sessionmaker, name="Bootleg Coffee") -> int:
    async with db_sessionmaker() as db:
        place = Place(
            google_place_id=f"gp-{name}",
            name=name,
            formatted_address="12 Soi Ari 4, Bangkok",
            lat=13.779,
            lng=100.543,
            types=["cafe"],
        )
        db.add(place)
        await db.commit()
        return place.id


async def test_what_and_where_are_separate_fields(client):
    await register(client)
    expense = (
        await client.post(
            "/api/expenses",
            json={
                "total": "95",
                "currency": "THB",
                "description": "Flat white",
                "merchant": "Bootleg Coffee",
            },
        )
    ).json()
    assert expense["description"] == "Flat white"
    assert expense["merchant"] == "Bootleg Coffee"
    assert expense["place"] is None


async def test_picking_a_place_links_it_and_fills_the_name(client, db_sessionmaker):
    place_id = await _make_place(db_sessionmaker)
    await register(client)
    expense = (
        await client.post(
            "/api/expenses",
            json={
                "total": "95",
                "currency": "THB",
                "description": "Flat white",
                "place_id": place_id,
            },
        )
    ).json()
    assert expense["place"]["id"] == place_id
    assert expense["place"]["name"] == "Bootleg Coffee"
    # merchant is backfilled from the place, so grouping keeps working
    assert expense["merchant"] == "Bootleg Coffee"


async def test_free_text_where_survives_alongside_a_place(client, db_sessionmaker):
    place_id = await _make_place(db_sessionmaker)
    await register(client)
    expense = (
        await client.post(
            "/api/expenses",
            json={
                "total": "95",
                "currency": "THB",
                "merchant": "Bootleg (the Ari one)",
                "place_id": place_id,
            },
        )
    ).json()
    assert expense["merchant"] == "Bootleg (the Ari one)"
    assert expense["place"]["id"] == place_id


async def test_unknown_place_id_is_ignored_not_fatal(client):
    await register(client)
    expense = (
        await client.post(
            "/api/expenses",
            json={"total": "95", "currency": "THB", "merchant": "Somewhere", "place_id": 9999},
        )
    ).json()
    assert expense["place"] is None
    assert expense["merchant"] == "Somewhere"


async def test_patch_updates_what_and_where(client, db_sessionmaker):
    place_id = await _make_place(db_sessionmaker)
    await register(client)
    expense = (
        await client.post("/api/expenses", json={"total": "95", "currency": "THB"})
    ).json()

    updated = (
        await client.patch(
            f"/api/expenses/{expense['id']}",
            json={"description": "Cold brew", "place_id": place_id},
        )
    ).json()
    assert updated["description"] == "Cold brew"
    assert updated["place"]["id"] == place_id
    assert updated["merchant"] == "Bootleg Coffee"


async def test_receipt_expense_inherits_the_photo_place(
    client, db_sessionmaker, monkeypatch
):
    """A receipt photographed at a known place records that place."""
    import app.services.analysis as analysis_mod
    from app.models import Image
    from app.services.analysis import run_image_analysis
    from tests.test_receipts import RECEIPT_RESULT
    from tests.util import make_jpeg

    place_id = await _make_place(db_sessionmaker, name="Menya Itto")
    await register(client)
    created = (
        await client.post(
            "/api/images",
            files=[
                (
                    "files",
                    ("r.jpg", make_jpeg(13.7466, 100.5395, color=(250, 250, 250)), "image/jpeg"),
                )
            ],
        )
    ).json()

    async def fake_vision(path, mime):
        return RECEIPT_RESULT

    monkeypatch.setattr(analysis_mod, "analyze_image_content", fake_vision)

    # Pretend GPS resolution found the place (needs a Google key in real life)
    async def fake_resolve(db, lat, lng, hint=None):
        return await db.get(Place, place_id)

    monkeypatch.setattr(analysis_mod, "resolve_place", fake_resolve)

    async with db_sessionmaker() as db:
        await run_image_analysis(db, created[0]["id"])
        image = await db.get(Image, created[0]["id"])
        assert image.place_id == place_id

    expense = (await client.get("/api/expenses")).json()[0]
    assert expense["place"]["id"] == place_id
    assert expense["merchant"] == "Ramen Ya"  # the name printed on the receipt


async def test_summary_still_groups_by_where(client, db_sessionmaker):
    place_id = await _make_place(db_sessionmaker)
    await register(client)
    await client.post(
        "/api/expenses",
        json={"total": "95", "currency": "THB", "description": "Flat white", "place_id": place_id},
    )
    await client.post(
        "/api/expenses",
        json={"total": "120", "currency": "THB", "description": "Cold brew", "place_id": place_id},
    )
    summary = (await client.get("/api/expenses/summary")).json()
    assert summary["by_merchant"] == [
        {
            "merchant": "Bootleg Coffee",
            "base_currency": "THB",
            "base_total_minor": 21500,
            "count": 2,
        }
    ]


async def test_deleting_a_place_keeps_the_expense(client, db_sessionmaker):
    place_id = await _make_place(db_sessionmaker)
    await register(client)
    expense = (
        await client.post(
            "/api/expenses", json={"total": "95", "currency": "THB", "place_id": place_id}
        )
    ).json()

    async with db_sessionmaker() as db:
        await db.execute(sa.delete(Place).where(Place.id == place_id))
        await db.commit()

    refreshed = (await client.get("/api/expenses")).json()[0]
    assert refreshed["id"] == expense["id"]
    assert refreshed["place"] is None
    assert refreshed["merchant"] == "Bootleg Coffee"  # the name we recorded survives
