import asyncio
from pathlib import Path

import sqlalchemy as sa
from fastapi import APIRouter, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import selectinload

from app.config import settings
from app.deps import CurrentUser, DbSession
from app.models import Image, Place
from app.schemas import ImageAssignRequest, ImageOut, ImageUpdate
from app.serialize import image_out
from app.services import storage
from app.services.clustering import place_edit_regroups, recluster_user, refresh_visit_place
from app.services.exif import ExifData, extract_exif
from app.services.localtime import MAX_OFFSET_MINUTES, local_now
from app.services.places import search_place_by_text

router = APIRouter(prefix="/images", tags=["images"])

_LOADS = (
    selectinload(Image.place),
    selectinload(Image.analysis),
    selectinload(Image.expense),
)


async def _get_owned_image(db: DbSession, user_id: int, image_id: int) -> Image:
    image = await db.scalar(
        sa.select(Image)
        .where(Image.id == image_id, Image.user_id == user_id)
        .options(*_LOADS)
        # Re-read a row the session already holds, so a handler that reloads
        # after writing sees its own change rather than the identity map's
        # copy of the relationships from before it.
        .execution_options(populate_existing=True)
    )
    if image is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Image not found")
    return image


async def _defer_analysis(image_id: int) -> None:
    from app.worker.tasks import analyze_image

    await analyze_image.defer_async(image_id=image_id)


@router.post("", response_model=list[ImageOut], status_code=201)
async def upload_images(
    files: list[UploadFile],
    user: CurrentUser,
    db: DbSession,
    tz_offset_minutes: int = Query(
        default=0,
        ge=-MAX_OFFSET_MINUTES,
        le=MAX_OFFSET_MINUTES,
        description="The uploader's UTC offset, for photos whose own clock is missing",
    ),
):
    if not files:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No files provided")

    # Check the whole batch before writing any of it. Rejecting halfway — on
    # size or on a file that is not an image — used to leave the already-saved
    # originals on disk with no rows to reference them, since the commit never
    # happened.
    accepted: list[tuple[bytes, str, ExifData]] = []
    for upload in files:
        data = await upload.read()
        if len(data) == 0:
            continue
        if len(data) > settings.max_upload_bytes:
            raise HTTPException(
                status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                f"{upload.filename or 'file'} exceeds the {settings.max_upload_bytes} byte limit",
            )
        mime = storage.sniff_mime(data, fallback=upload.content_type or "")
        if not mime.startswith("image/"):
            raise HTTPException(
                status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                f"{upload.filename or 'file'} is not a recognized image",
            )
        # A location is worth having but not worth refusing a photo over: a
        # screenshot of a receipt carries no GPS and is still the record of
        # what was spent. What it does have is a time, which is enough to put
        # it on the right day and, usually, in the right stop.
        exif = await asyncio.to_thread(extract_exif, data)
        accepted.append((data, mime, exif))

    # A photo whose camera never wrote a timestamp is filed under when it
    # arrived — but as the *uploader's* clock reads it, not the server's. The
    # column is a local wall clock (`app.services.localtime`), and dropping a
    # UTC instant into it would put a photo uploaded over dinner in Bangkok at
    # lunchtime, hours from the photos it was taken beside.
    arrived_at = local_now(tz_offset_minutes)

    created: list[Image] = []
    for data, mime, exif in accepted:
        sha256 = storage.sha256_hex(data)
        duplicate = await db.scalar(
            sa.select(Image).where(Image.user_id == user.id, Image.sha256 == sha256)
        )
        if duplicate:
            continue
        ext = storage.EXT_BY_MIME.get(mime, "bin")
        path = storage.save_original(user.id, sha256, ext, data)
        # Keep what the loop above already read. Deriving it again in the
        # worker meant the location lived only inside the analysis transaction:
        # any failure rolled it back, and the photo — still in the log —
        # resurfaced on the timeline with no place and today's date on it.
        image = Image(
            user_id=user.id,
            sha256=sha256,
            original_path=str(path),
            mime=mime,
            size_bytes=len(data),
            status="pending",
            lat=exif.lat,
            lng=exif.lng,
            taken_at=exif.taken_at or arrived_at,
            exif_taken_at=exif.taken_at,
            taken_at_source="exif" if exif.taken_at else "upload",
            exif=exif.raw or None,
        )
        db.add(image)
        created.append(image)
    await db.commit()
    for image in created:
        await _defer_analysis(image.id)
    # Ordered by id, which follows insertion, which follows the order the files
    # arrived in. Without it Postgres answers in whatever order it likes, and a
    # caller pairing the response with the files it sent gets them shuffled.
    result = await db.execute(
        sa.select(Image)
        .where(Image.id.in_([i.id for i in created]))
        .order_by(Image.id)
        .options(*_LOADS)
    )
    return [image_out(image) for image in result.scalars()]


@router.get("/{image_id}", response_model=ImageOut)
async def get_image(image_id: int, user: CurrentUser, db: DbSession):
    return image_out(await _get_owned_image(db, user.id, image_id))


@router.post("/{image_id}/reanalyze", response_model=ImageOut)
async def reanalyze_image(image_id: int, user: CurrentUser, db: DbSession):
    image = await _get_owned_image(db, user.id, image_id)
    image.status = "pending"
    image.error = None
    await db.commit()
    await _defer_analysis(image.id)
    return image_out(image)


async def _place_from(db: DbSession, image: Image, body: ImageUpdate) -> Place | None:
    """The place the user meant, by id or by the name they typed, or None to clear.

    A typed name is searched for near the photo, so "Starbucks" resolves to the
    one in the picture rather than the best match to nothing in particular.
    Nothing found is a 404 the picker shows inline — better than a save that
    quietly does nothing, which is how this read before it could take a name at
    all.
    """
    if body.place_id is not None:
        place = await db.get(Place, body.place_id)
        if place is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Place not found")
        return place
    query = (body.place_query or "").strip()
    if not query:
        return None
    near = (image.lat, image.lng) if image.lat is not None and image.lng is not None else None
    place = await search_place_by_text(db, query, near=near)
    if place is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            "No matching place found"
            if settings.google_maps_api_key
            else "Place search needs a Google Maps API key — pick one of the suggestions instead",
        )
    return place


@router.patch("/{image_id}", response_model=ImageOut)
async def update_image(image_id: int, body: ImageUpdate, user: CurrentUser, db: DbSession):
    """Correct the time or place the pipeline read off a photo.

    Reverse geocoding picks the nearest match to the GPS fix, which indoors or
    in a dense block is often the shop next door. Rather than make the user
    re-analyze and hope for a different answer, let them say which place it was
    — and remember that they did, so re-analyzing never answers back over them.
    """
    image = await _get_owned_image(db, user.id, image_id)
    sent = body.model_dump(exclude_unset=True)

    if "taken_at" in sent:
        if body.taken_at is None:
            if image.exif_taken_at is None:
                raise HTTPException(
                    status.HTTP_409_CONFLICT, "This image has no EXIF date to restore"
                )
            image.taken_at = image.exif_taken_at
            image.taken_at_source = "exif"
        else:
            image.taken_at = body.taken_at
            image.taken_at_source = "custom"
        await db.commit()
        # Time determines both the day and the stop, so refresh the itinerary
        # immediately after a correction rather than waiting for analysis.
        await recluster_user(db, user)

    if "place_id" in sent or "place_query" in sent:
        place = await _place_from(db, image, body)
        image.place_id = place.id if place is not None else None
        # Taking one off is an answer too, so it pins as well: re-analysis must
        # not put back the place the user just rejected.
        image.place_pinned = True
        await db.commit()
        if await place_edit_regroups(db, image):
            # The answer can change which photos belong together — a photo with
            # no GPS gains the coordinates of its place, and a place picked by
            # hand outranks the distance between two fixes — so rebuild the
            # stops rather than only renaming one.
            await recluster_user(db, user)
        elif image.visit_id is not None:
            # Nothing can move, so only the name is out of date. Renaming in
            # place keeps the stop's id, and with it the card the user is
            # looking at.
            await refresh_visit_place(db, image.visit_id)

    return image_out(await _get_owned_image(db, user.id, image_id))


@router.post("/{image_id}/assign", response_model=ImageOut)
async def assign_image(
    image_id: int, body: ImageAssignRequest, user: CurrentUser, db: DbSession
):
    """Manually attach an image to a visit (or detach with visit_id=null)."""
    image = await _get_owned_image(db, user.id, image_id)
    if body.visit_id is not None:
        from app.models import Visit

        visit = await db.scalar(
            sa.select(Visit).where(Visit.id == body.visit_id, Visit.user_id == user.id)
        )
        if visit is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Visit not found")
        visit.pinned = True  # manual placement must survive re-clustering
    image.visit_id = body.visit_id
    await db.commit()
    return image_out(image)


@router.delete("/{image_id}", status_code=204)
async def delete_image(image_id: int, user: CurrentUser, db: DbSession):
    image = await _get_owned_image(db, user.id, image_id)
    for path_str in (image.original_path, image.thumb_path):
        if path_str:
            Path(path_str).unlink(missing_ok=True)
    await db.delete(image)
    await db.commit()
    await recluster_user(db, user)


def _serve_file(path_str: str | None, mime: str) -> FileResponse:
    if not path_str or not Path(path_str).is_file():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "File missing on disk")
    headers = {"Cache-Control": "private, max-age=86400"}
    return FileResponse(path_str, media_type=mime, headers=headers)


@router.get("/{image_id}/file")
async def get_image_file(image_id: int, user: CurrentUser, db: DbSession):
    image = await _get_owned_image(db, user.id, image_id)
    return _serve_file(image.original_path, image.mime)


@router.get("/{image_id}/thumb")
async def get_image_thumb(image_id: int, user: CurrentUser, db: DbSession):
    image = await _get_owned_image(db, user.id, image_id)
    return _serve_file(image.thumb_path, "image/jpeg")
