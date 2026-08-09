import sqlalchemy as sa
from fastapi import APIRouter, Response

from app.deps import DbSession

router = APIRouter(tags=["health"])


@router.get("/healthz")
async def healthz():
    return {"status": "ok"}


@router.get("/readyz")
async def readyz(db: DbSession, response: Response):
    try:
        await db.execute(sa.text("SELECT 1"))
    except Exception:
        response.status_code = 503
        return {"status": "database unreachable"}
    return {"status": "ready"}
