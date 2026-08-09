import asyncio

from sqlalchemy.ext.asyncio import create_async_engine

from alembic import context
from app.config import settings
from app.models import Base

target_metadata = Base.metadata


def include_object(object_, name, type_, reflected, compare_to) -> bool:
    """Keep Procrastinate's own schema out of autogenerate.

    The queue tables are created by `python -m app.worker.apply_schema`, not by
    SQLAlchemy metadata, so autogenerate would otherwise emit DROP TABLE for
    every one of them and take the job queue down with it.
    """
    table = name if type_ == "table" else getattr(object_, "table", None)
    table_name = table if isinstance(table, str) else getattr(table, "name", "")
    return not str(table_name).startswith("procrastinate_")


def run_migrations_offline() -> None:
    context.configure(
        url=settings.database_url.replace("+asyncpg", ""),
        target_metadata=target_metadata,
        include_object=include_object,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        include_object=include_object,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    engine = create_async_engine(settings.database_url)
    async with engine.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
