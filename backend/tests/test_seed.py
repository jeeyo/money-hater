"""The demo seeder is wired into devcontainer startup, so it must keep working."""

from datetime import UTC, datetime

import sqlalchemy as sa

import app.dev.seed as seed_mod
from app.dev.seed import DEMO_EMAIL, DEMO_PASSWORD, build, main
from app.models import Expense, Image, Trip, User, Visit
from app.security import verify_password


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
        # One hand-made trip grouping the Chiang Mai days
        assert await db.scalar(sa.select(sa.func.count()).select_from(Trip)) == 1

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


async def test_demo_data_is_anchored_to_today(db_sessionmaker):
    """Dates are relative, so the demo never shows a stale month."""
    async with db_sessionmaker() as db:
        await build(db)

    async with db_sessionmaker() as db:
        latest = await db.scalar(sa.select(sa.func.max(Image.taken_at)))
        if latest.tzinfo is None:
            latest = latest.replace(tzinfo=UTC)
        assert (datetime.now(UTC) - latest).days <= 1
