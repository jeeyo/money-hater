from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from app.queue import queue_app
from app.routers import auth, expenses, health, images, places, timeline, trips

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"


@asynccontextmanager
async def lifespan(_app: FastAPI):
    async with queue_app.open_async():
        yield


app = FastAPI(title="Money Hater — Trip Logger", lifespan=lifespan)

app.include_router(health.router)

api = FastAPI(title="Money Hater API")
api.include_router(auth.router)
api.include_router(images.router)
api.include_router(timeline.router)
api.include_router(trips.router)
api.include_router(expenses.router)
api.include_router(places.router)
app.mount("/api", api)

# In the production container the built frontend is baked into backend/static;
# in development Vite serves the frontend and proxies /api here instead.
if STATIC_DIR.is_dir():
    assets = STATIC_DIR / "assets"
    if assets.is_dir():
        app.mount("/assets", StaticFiles(directory=assets), name="assets")

    @app.post("/share-target", include_in_schema=False)
    async def share_target_fallback():
        """Catch a share that arrives before the service worker can answer it.

        Sharing photos POSTs a multipart form here, and normally the service
        worker intercepts it (see the frontend's public/share-target.js). It
        cannot on the very first share after install, when no worker controls
        the page yet, and the request reaches the server instead — where every
        other route is a GET, so the phone's share sheet used to end at a bare
        405. Send the user to the upload screen to pick the photos by hand;
        the body cannot be handed on, but landing somewhere useful can.
        """
        return RedirectResponse("/upload?shared=0", status_code=303)

    @app.get("/{path:path}", include_in_schema=False)
    async def spa(path: str):
        candidate = (STATIC_DIR / path).resolve()
        if path and candidate.is_file() and candidate.is_relative_to(STATIC_DIR):
            return FileResponse(candidate)
        return FileResponse(STATIC_DIR / "index.html")
