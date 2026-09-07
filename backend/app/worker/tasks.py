from app.db import SessionLocal
from app.queue import queue_app
from app.services.analysis import run_image_analysis
from app.services.recommend import run_recommendation
from app.services.subscriptions import run_due


@queue_app.task(name="analyze_image", retry=3, queue="analysis")
async def analyze_image(image_id: int) -> None:
    async with SessionLocal() as db:
        await run_image_analysis(db, image_id)


# Runs every hour; each firing catches up any subscription due since the last
# one, so a missed run (the worker was down) still charges every period it
# owes rather than skipping straight to the latest.
@queue_app.periodic(cron="0 * * * *")
@queue_app.task(name="run_due_subscriptions", retry=3, queue="subscriptions")
async def run_due_subscriptions(timestamp: int) -> None:
    async with SessionLocal() as db:
        await run_due(db)


# retry=1, unlike analysis: a suggestion the user can just ask for again is not
# worth three model calls, and by the third the moment has passed anyway.
@queue_app.task(name="recommend_next", retry=1, queue="recommend")
async def recommend_next(recommendation_id: int) -> None:
    async with SessionLocal() as db:
        await run_recommendation(db, recommendation_id)
