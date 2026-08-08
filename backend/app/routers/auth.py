from datetime import UTC, datetime, timedelta
from typing import Annotated

import sqlalchemy as sa
from fastapi import APIRouter, Cookie, HTTPException, Response, status

from app.config import settings
from app.deps import CurrentUser, DbSession
from app.models import AuthSession, User
from app.schemas import LoginRequest, RegisterRequest, SettingsUpdate, UserOut
from app.security import (
    REFRESH_COOKIE,
    clear_auth_cookies,
    hash_password,
    hash_refresh_token,
    make_access_token,
    make_refresh_token,
    set_auth_cookies,
    verify_password,
)
from app.serialize import user_out

router = APIRouter(prefix="/auth", tags=["auth"])


async def _start_session(db: DbSession, response: Response, user: User) -> None:
    refresh_token = make_refresh_token()
    db.add(
        AuthSession(
            user_id=user.id,
            refresh_token_hash=hash_refresh_token(refresh_token),
            expires_at=datetime.now(UTC) + timedelta(days=settings.refresh_token_ttl_days),
        )
    )
    await db.commit()
    set_auth_cookies(response, make_access_token(user.id), refresh_token)


@router.post("/register", response_model=UserOut, status_code=201)
async def register(body: RegisterRequest, db: DbSession, response: Response):
    existing = await db.scalar(sa.select(User).where(User.email == body.email.lower()))
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")
    user = User(email=body.email.lower(), password_hash=hash_password(body.password))
    db.add(user)
    await db.flush()
    await _start_session(db, response, user)
    return user_out(user)


@router.post("/login", response_model=UserOut)
async def login(body: LoginRequest, db: DbSession, response: Response):
    user = await db.scalar(sa.select(User).where(User.email == body.email.lower()))
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
    await _start_session(db, response, user)
    return user_out(user)


@router.post("/refresh", response_model=UserOut)
async def refresh(
    db: DbSession,
    response: Response,
    mh_refresh: Annotated[str | None, Cookie(alias=REFRESH_COOKIE)] = None,
):
    if not mh_refresh:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "No refresh token")
    token_hash = hash_refresh_token(mh_refresh)
    session = await db.scalar(
        sa.select(AuthSession).where(AuthSession.refresh_token_hash == token_hash)
    )
    now = datetime.now(UTC)
    if (
        session is None
        or session.revoked_at is not None
        or session.expires_at.replace(tzinfo=session.expires_at.tzinfo or UTC) < now
    ):
        clear_auth_cookies(response)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid refresh token")
    user = await db.get(User, session.user_id)
    if user is None:
        clear_auth_cookies(response)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Unknown user")
    # Rotate: revoke the old session, issue a new refresh token
    session.revoked_at = now
    await _start_session(db, response, user)
    return user_out(user)


@router.post("/logout", status_code=204)
async def logout(
    db: DbSession,
    response: Response,
    mh_refresh: Annotated[str | None, Cookie(alias=REFRESH_COOKIE)] = None,
):
    if mh_refresh:
        await db.execute(
            sa.update(AuthSession)
            .where(AuthSession.refresh_token_hash == hash_refresh_token(mh_refresh))
            .values(revoked_at=datetime.now(UTC))
        )
        await db.commit()
    clear_auth_cookies(response)


@router.get("/me", response_model=UserOut)
async def me(user: CurrentUser):
    return user_out(user)


@router.patch("/me", response_model=UserOut)
async def update_settings(body: SettingsUpdate, user: CurrentUser, db: DbSession):
    if body.preferred_currency is not None:
        user.preferred_currency = body.preferred_currency.upper()
    for field in ("home_lat", "home_lng", "home_label"):
        value = getattr(body, field)
        if value is not None:
            setattr(user, field, value)
    await db.commit()
    return user_out(user)
