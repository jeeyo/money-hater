from app.db import SessionLocal
from app.queue import queue_app
from app.services.analysis import run_image_analysis


@queue_app.task(name="analyze_image", retry=3, queue="analysis")
async def analyze_image(image_id: int) -> None:
    async with SessionLocal() as db:
        await run_image_analysis(db, image_id)
