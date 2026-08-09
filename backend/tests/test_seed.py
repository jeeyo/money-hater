"""The demo seeder is wired into devcontainer startup, so it must keep working."""

from datetime import UTC, datetime

import pytest
import sqlalchemy as sa
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

import app.dev.seed as seed_mod
from app.config import settings
from app.dev.seed import DEMO_EMAIL, DEMO_PASSWORD, build, main, seed_recommendations
from app.models import Base, Expense, Image, Place, Trip, TripRecommendation, User, Visit
from app.security import verify_password
from app.services.trips import load_trip


async def test_seed_builds_a_usable_demo_account(db_sessionmaker, monkeypatch):
    monkeypatch.setattr(seed_mod, "SessionLocal", db_sessionmaker)
    assert await main(reset=False) == 0

    async with db_sessionmaker() as db:
        user = await db.scalar(sa.select(User).where(User.email == DEMO_EMAIL))
        assert user is not None
        assert verify_password(DEMO_PASSWORD, user.password_hash)
        assert user.preferred_currency == "THB"

        # Photos, clustered stops and trips
        assert await db.scalar(sa.select(sa.func.count()).select_from(Image)) == 10
        assert await db.scalar(sa.select(sa.func.count()).select_from(Visit)) > 0
        # Two hand-made trips: the finished Chiang Mai weekend and today's,
        # still running, so both states are on screen in a fresh devcontainer.
        trips = (await db.execute(sa.select(Trip))).scalars().all()
        assert {trip.title for trip in trips} == {"Chiang Mai weekend", "Out in Bangkok"}
        assert [trip.title for trip in trips if trip.end_expense_id is None] == ["Out in Bangkok"]

        # A ready "what next?" set for the ongoing trip, so the panel has
        # something to show without an OPENAI_API_KEY.
        #
        # Seeded against a pinned clock: a suggestion hangs off the last stop
        # you have reached, so whether the demo has one at all depends on the
        # hour the container starts, and the test must not.
        # load_trip eager-loads the bounding expenses the window is derived from
        open_trip = await load_trip(
            db, user, next(t.id for t in trips if t.end_expense_id is None)
        )
        await db.execute(sa.delete(TripRecommendation))
        await seed_recommendations(
            db, user, open_trip, now=datetime.now(UTC).replace(hour=23, minute=0)
        )
        recommendation = await db.scalar(sa.select(TripRecommendation))
        assert recommendation is not None
        assert recommendation.status == "ready"
        assert recommendation.model == "demo"
        assert recommendation.anchor_visit_id is not None
        assert await db.get(Visit, recommendation.anchor_visit_id) is not None
        assert len(recommendation.items) >= 3
        for item in recommendation.items:
            place = await db.scalar(
                sa.select(Place).where(Place.google_place_id == item["google_place_id"])
            )
            assert place is not None, "every card must point at a real seeded place"
            assert (place.raw or {}).get("reviews"), "so opening a card shows comments"

        expenses = (await db.execute(sa.select(Expense))).scalars().all()
        # Receipt-backed, hand-entered, and one foreign awaiting confirmation
        assert {e.source for e in expenses} == {"receipt", "manual"}
        assert any(e.image_id is None for e in expenses)
        foreign = [e for e in expenses if e.currency != "THB"]
        assert len(foreign) == 1
        assert foreign[0].needs_review is True
        assert foreign[0].base_total_minor is not None


async def test_seed_is_a_no_op_when_the_account_exists(db_sessionmaker, monkeypatch):
    """Devcontainer restarts must not wipe or duplicate a developer's data."""
    monkeypatch.setattr(seed_mod, "SessionLocal", db_sessionmaker)
    await main(reset=False)

    async with db_sessionmaker() as db:
        user = await db.scalar(sa.select(User).where(User.email == DEMO_EMAIL))
        marker = Expense(
            user_id=user.id,
            source="manual",
            description="something a developer added",
            currency="THB",
            total_minor=1,
            base_currency="THB",
            base_total_minor=1,
        )
        db.add(marker)
        await db.commit()
        before = await db.scalar(sa.select(sa.func.count()).select_from(Expense))

    await main(reset=False)

    async with db_sessionmaker() as db:
        assert await db.scalar(sa.select(sa.func.count()).select_from(User)) == 1
        assert await db.scalar(sa.select(sa.func.count()).select_from(Expense)) == before
        assert await db.scalar(
            sa.select(Expense).where(Expense.description == "something a developer added")
        )


async def test_reset_rebuilds_from_scratch(db_sessionmaker, monkeypatch):
    monkeypatch.setattr(seed_mod, "SessionLocal", db_sessionmaker)
    await main(reset=False)
    async with db_sessionmaker() as db:
        before = await db.scalar(sa.select(sa.func.count()).select_from(Expense))

    await main(reset=True)

    async with db_sessionmaker() as db:
        assert await db.scalar(sa.select(sa.func.count()).select_from(User)) == 1
        assert await db.scalar(sa.select(sa.func.count()).select_from(Expense)) == before


@pytest.fixture
async def strict_sessionmaker(tmp_path, monkeypatch):
    """A test database that enforces foreign keys, as Postgres does.

    sqlite ignores them unless asked, which hides ordering mistakes in `purge`:
    a trip's bounding expenses are ON DELETE RESTRICT, so deleting expenses
    while a trip still points at them fails for real users and not in tests.
    """
    engine = create_async_engine(
        "sqlite+aiosqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )

    @sa.event.listens_for(engine.sync_engine, "connect")
    def _enforce_foreign_keys(connection, _record):
        connection.execute("PRAGMA foreign_keys=ON")

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    monkeypatch.setattr(settings, "media_root", tmp_path / "media")
    yield async_sessionmaker(engine, expire_on_commit=False)
    await engine.dispose()


async def test_reset_survives_foreign_keys_being_enforced(strict_sessionmaker, monkeypatch):
    monkeypatch.setattr(seed_mod, "SessionLocal", strict_sessionmaker)
    assert await main(reset=False) == 0
    assert await main(reset=True) == 0

    async with strict_sessionmaker() as db:
        assert await db.scalar(sa.select(sa.func.count()).select_from(User)) == 1
        assert await db.scalar(sa.select(sa.func.count()).select_from(Trip)) == 2


async def test_demo_data_is_anchored_to_today(db_sessionmaker):
    """Dates are relative, so the demo never shows a stale month."""
    async with db_sessionmaker() as db:
        await build(db)

    async with db_sessionmaker() as db:
        latest = await db.scalar(sa.select(sa.func.max(Image.taken_at)))
        if latest.tzinfo is None:
            latest = latest.replace(tzinfo=UTC)
        assert (datetime.now(UTC) - latest).days <= 1
