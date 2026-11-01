import sqlalchemy as sa
from fastapi import APIRouter, HTTPException, status
from sqlalchemy.orm import selectinload

from app.deps import CurrentUser, DbSession
from app.models import Expense, Image, Visit
from app.schemas import VisitOut, VisitUpdate
from app.serialize import visit_out
from app.services.places import search_place_by_text

router = APIRouter(prefix="/visits", tags=["visits"])


@router.patch("/{visit_id}", response_model=VisitOut)
async def update_visit(visit_id: int, body: VisitUpdate, user: CurrentUser, db: DbSession):
    visit = await db.scalar(
        sa.select(Visit)
        .where(Visit.id == visit_id, Visit.user_id == user.id)
        .options(
            selectinload(Visit.place),
            selectinload(Visit.expenses).options(
                selectinload(Expense.items), selectinload(Expense.place)
            ),
            selectinload(Visit.images).selectinload(Image.analysis),
            selectinload(Visit.images).selectinload(Image.expense),
            selectinload(Visit.images).selectinload(Image.place),
        )
    )
    if visit is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Visit not found")
    edited = False
    if body.label_override is not None:
        visit.label_override = body.label_override or None
        edited = True
    if body.place_query is not None:
        place = await search_place_by_text(db, body.place_query)
        if place is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "No matching place found")
        visit.place_id = place.id
        edited = True
    # Pinned only when the user actually changed something: an empty edit must
    # not freeze the stop out of re-clustering.
    if edited:
        visit.pinned = True
    await db.commit()
    await db.refresh(visit)
    return visit_out(visit, user.preferred_currency)
