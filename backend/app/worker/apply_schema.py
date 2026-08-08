"""Apply the Procrastinate queue schema: `python -m app.worker.apply_schema`.

Skips when the schema is already present so this can run unconditionally on
every deploy (initContainer / devcontainer postCreate).
"""

import asyncio

from app.queue import queue_app


async def main() -> None:
    async with queue_app.open_async():
        row = await queue_app.connector.execute_query_one_async(
            "SELECT to_regclass('procrastinate_jobs') AS existing"
        )
        if row["existing"]:
            print("procrastinate schema already present, skipping")
            return
        await queue_app.schema_manager.apply_schema_async()
        print("procrastinate schema applied")


if __name__ == "__main__":
    asyncio.run(main())
