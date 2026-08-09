"""Worker entrypoint: `python -m app.worker.run`."""

import asyncio
import logging

from app.queue import queue_app


async def main() -> None:
    logging.basicConfig(level=logging.INFO)
    async with queue_app.open_async():
        await queue_app.run_worker_async(queues=["analysis", "recommend"], concurrency=2)


if __name__ == "__main__":
    asyncio.run(main())
