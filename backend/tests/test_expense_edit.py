"""Editing an existing expense: what, where, amount, currency and time."""

from datetime import datetime

import sqlalchemy as sa

from app.models import Place, Visit
from app.services.analysis import run_image_analysis
from tests.conftest import register
from tests.util import make_jpeg

BKK = (13.7563, 100.5018)


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


async def _add(client, **body) -> dict:
    payload = {"total": "100", "currency": "THB", **body}
    response = await client.post("/api/expenses", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


async def test_edit_what_only_leaves_where_alone(client):
    await register(client)
    expense = await _add(client, description="Coffee", merchant="Bootleg")
    updated = (
        await client.patch(
            f"/api/expenses/{expense['id']}", json={"description": "Iced coffee"}
        )
    ).json()
    assert updated["description"] == "Iced coffee"
    assert updated["merchant"] == "Bootleg"


async def test_edit_where_to_a_picked_place(client, db_sessionmaker):
    place_id = await _make_place(db_sessionmaker)
    await register(client)
    expense = await _add(client, description="Coffee", merchant="that cafe on Ari")

    updated = (
        await client.patch(f"/api/expenses/{expense['id']}", json={"place_id": place_id})
    ).json()
    assert updated["place"]["id"] == place_id
    # An existing hand-typed name is not clobbered by the link
    assert updated["merchant"] == "that cafe on Ari"


async def test_clearing_the_place_keeps_the_name(client, db_sessionmaker):
    place_id = await _make_place(db_sessionmaker)
    await register(client)
    expense = await _add(client, place_id=place_id)
    assert expense["place"]["id"] == place_id

    cleared = (
        await client.patch(f"/api/expenses/{expense['id']}", json={"place_id": None})
    ).json()
    assert cleared["place"] is None
    assert cleared["merchant"] == "Bootleg Coffee"


async def test_omitting_place_id_does_not_clear_it(client, db_sessionmaker):
    """A partial edit of another field must not silently unlink the place."""
    place_id = await _make_place(db_sessionmaker)
    await register(client)
    expense = await _add(client, place_id=place_id)

    updated = (
        await client.patch(f"/api/expenses/{expense['id']}", json={"description": "Latte"})
    ).json()
    assert updated["place"]["id"] == place_id


async def test_clearing_the_description(client):
    await register(client)
    expense = await _add(client, description="Coffee")
    cleared = (
        await client.patch(f"/api/expenses/{expense['id']}", json={"description": ""})
    ).json()
    assert cleared["description"] is None


async def test_editing_the_time_moves_it_between_stops(client, db_sessionmaker):
    """Correcting when you spent should move the expense to the right stop."""
    await register(client)
    for name, when in [
        ("morning.jpg", datetime(2026, 8, 8, 9, 0)),
        ("evening.jpg", datetime(2026, 8, 8, 19, 0)),
    ]:
        created = (
            await client.post(
                "/api/images",
                files=[("files", (name, make_jpeg(*BKK, taken_at=when), "image/jpeg"))],
            )
        ).json()
        async with db_sessionmaker() as db:
            await run_image_analysis(db, created[0]["id"])

    async with db_sessionmaker() as db:
        visits = (
            (await db.execute(sa.select(Visit).order_by(Visit.started_at))).scalars().all()
        )
        morning, evening = visits[0].id, visits[1].id

    expense = await _add(client, spent_at="2026-08-08T09:00:00Z")
    assert expense["visit_id"] == morning

    moved = (
        await client.patch(
            f"/api/expenses/{expense['id']}", json={"spent_at": "2026-08-08T19:00:00Z"}
        )
    ).json()
    assert moved["visit_id"] == evening


async def test_editing_the_time_can_detach_from_every_stop(client, db_sessionmaker):
    await register(client)
    created = (
        await client.post(
            "/api/images",
            files=[
                (
                    "files",
                    ("a.jpg", make_jpeg(*BKK, taken_at=datetime(2026, 8, 8, 9, 0)), "image/jpeg"),
                )
            ],
        )
    ).json()
    async with db_sessionmaker() as db:
        await run_image_analysis(db, created[0]["id"])

    expense = await _add(client, spent_at="2026-08-08T09:00:00Z")
    assert expense["visit_id"] is not None

    moved = (
        await client.patch(
            f"/api/expenses/{expense['id']}", json={"spent_at": "2026-01-01T00:00:00Z"}
        )
    ).json()
    assert moved["visit_id"] is None


async def test_editing_the_amount_updates_the_base_total(client):
    await register(client)
    expense = await _add(client, description="Coffee")
    assert expense["base_total_minor"] == 10000

    updated = (
        await client.patch(f"/api/expenses/{expense['id']}", json={"total": "125.50"})
    ).json()
    assert updated["total_minor"] == 12550
    assert updated["base_total_minor"] == 12550


async def test_editing_currency_reconverts_and_asks_for_review(client, monkeypatch):
    from decimal import Decimal

    import app.services.fx as fx_mod

    async def _fetch(from_currency, to_currency):
        if (from_currency, to_currency) == ("JPY", "THB"):
            return Decimal("0.235"), datetime(2026, 8, 7).date()
        return None

    monkeypatch.setattr(fx_mod, "_fetch_rate", _fetch)
    await register(client)
    expense = await _add(client, description="Ramen")
    assert expense["needs_review"] is False

    updated = (
        await client.patch(
            f"/api/expenses/{expense['id']}", json={"currency": "JPY", "total": "1200"}
        )
    ).json()
    assert updated["currency"] == "JPY"
    assert updated["total_minor"] == 1200
    assert updated["base_total_minor"] == 28200
    assert updated["needs_review"] is True


async def test_editing_with_an_explicit_rate_needs_no_review(client):
    await register(client)
    expense = await _add(client, description="Ramen")
    updated = (
        await client.patch(
            f"/api/expenses/{expense['id']}",
            json={"currency": "JPY", "total": "1200", "fx_rate": "0.25"},
        )
    ).json()
    assert updated["base_total_minor"] == 30000
    assert updated["fx_rate_source"] == "manual"
    assert updated["needs_review"] is False


async def test_editing_a_receipt_expense_is_allowed(client, db_sessionmaker, monkeypatch):
    """AI gets things wrong; the user must be able to correct a parsed receipt."""
    import app.services.analysis as analysis_mod
    from tests.test_receipts import RECEIPT_RESULT

    await register(client)
    created = (
        await client.post(
            "/api/images",
            files=[("files", ("r.jpg", make_jpeg(color=(250, 250, 250)), "image/jpeg"))],
        )
    ).json()

    async def fake_vision(path, mime):
        return RECEIPT_RESULT

    monkeypatch.setattr(analysis_mod, "analyze_image_content", fake_vision)
    async with db_sessionmaker() as db:
        await run_image_analysis(db, created[0]["id"])

    expense = (await client.get("/api/expenses")).json()[0]
    updated = (
        await client.patch(
            f"/api/expenses/{expense['id']}",
            json={"description": "Team lunch", "merchant": "Ramen-Ya Ekamai"},
        )
    ).json()
    assert updated["description"] == "Team lunch"
    assert updated["merchant"] == "Ramen-Ya Ekamai"
    assert updated["image_id"] == created[0]["id"]  # still linked to its photo


async def test_editing_someone_elses_expense_is_a_404(client):
    await register(client, email="alice@example.com")
    expense = await _add(client, description="Coffee")

    await client.post("/api/auth/logout")
    await register(client, email="bob@example.com")
    assert (
        await client.patch(f"/api/expenses/{expense['id']}", json={"description": "hacked"})
    ).status_code == 404
