from datetime import date, datetime
from decimal import Decimal

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

# JSONB on Postgres, plain JSON elsewhere (sqlite in tests)
JSONType = sa.JSON().with_variant(JSONB(), "postgresql")
UTCDateTime = sa.DateTime(timezone=True)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(sa.String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(sa.String(255))
    # The currency everything is rolled up into; foreign spend is converted to it
    preferred_currency: Mapped[str] = mapped_column(sa.String(3), default="THB")
    home_lat: Mapped[float | None] = mapped_column(sa.Float)
    home_lng: Mapped[float | None] = mapped_column(sa.Float)
    home_label: Mapped[str | None] = mapped_column(sa.String(255))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, server_default=sa.func.now())


class AuthSession(Base):
    __tablename__ = "sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(sa.ForeignKey("users.id", ondelete="CASCADE"), index=True)
    refresh_token_hash: Mapped[str] = mapped_column(sa.String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, server_default=sa.func.now())
    revoked_at: Mapped[datetime | None] = mapped_column(UTCDateTime)


class Place(Base):
    __tablename__ = "places"

    id: Mapped[int] = mapped_column(primary_key=True)
    google_place_id: Mapped[str] = mapped_column(sa.String(255), unique=True)
    name: Mapped[str] = mapped_column(sa.String(255))
    formatted_address: Mapped[str | None] = mapped_column(sa.Text)
    lat: Mapped[float] = mapped_column(sa.Float)
    lng: Mapped[float] = mapped_column(sa.Float)
    types: Mapped[list | None] = mapped_column(JSONType)
    raw: Mapped[dict | None] = mapped_column(JSONType)
    fetched_at: Mapped[datetime] = mapped_column(UTCDateTime, server_default=sa.func.now())


class Trip(Base):
    __tablename__ = "trips"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(sa.ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str | None] = mapped_column(sa.String(255))  # user override
    auto_title: Mapped[str] = mapped_column(sa.String(255), default="Trip")
    kind: Mapped[str] = mapped_column(sa.String(16), default="outing")  # trip|commute|outing
    started_at: Mapped[datetime] = mapped_column(UTCDateTime, index=True)
    ended_at: Mapped[datetime] = mapped_column(UTCDateTime)
    pinned: Mapped[bool] = mapped_column(sa.Boolean, default=False)

    visits: Mapped[list["Visit"]] = relationship(
        back_populates="trip", cascade="all, delete-orphan", order_by="Visit.started_at"
    )


class Visit(Base):
    __tablename__ = "visits"

    id: Mapped[int] = mapped_column(primary_key=True)
    trip_id: Mapped[int] = mapped_column(sa.ForeignKey("trips.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(sa.ForeignKey("users.id", ondelete="CASCADE"), index=True)
    place_id: Mapped[int | None] = mapped_column(sa.ForeignKey("places.id", ondelete="SET NULL"))
    label_override: Mapped[str | None] = mapped_column(sa.String(255))
    started_at: Mapped[datetime] = mapped_column(UTCDateTime, index=True)
    ended_at: Mapped[datetime] = mapped_column(UTCDateTime)
    lat: Mapped[float | None] = mapped_column(sa.Float)  # centroid of member images
    lng: Mapped[float | None] = mapped_column(sa.Float)
    pinned: Mapped[bool] = mapped_column(sa.Boolean, default=False)

    trip: Mapped[Trip] = relationship(back_populates="visits")
    place: Mapped[Place | None] = relationship()
    images: Mapped[list["Image"]] = relationship(back_populates="visit", order_by="Image.taken_at")
    # Linked by visit_id, so manually entered expenses count too
    expenses: Mapped[list["Expense"]] = relationship(back_populates="visit")


class Image(Base):
    __tablename__ = "images"
    __table_args__ = (
        sa.UniqueConstraint("user_id", "sha256", name="uq_images_user_sha256"),
        sa.Index("ix_images_user_taken_at", "user_id", "taken_at"),
        sa.Index("ix_images_user_status", "user_id", "status"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(sa.ForeignKey("users.id", ondelete="CASCADE"), index=True)
    sha256: Mapped[str] = mapped_column(sa.String(64))
    original_path: Mapped[str] = mapped_column(sa.Text)
    thumb_path: Mapped[str | None] = mapped_column(sa.Text)
    mime: Mapped[str] = mapped_column(sa.String(64))
    size_bytes: Mapped[int] = mapped_column(sa.BigInteger)
    taken_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    taken_at_source: Mapped[str] = mapped_column(sa.String(16), default="upload")
    lat: Mapped[float | None] = mapped_column(sa.Float)
    lng: Mapped[float | None] = mapped_column(sa.Float)
    exif: Mapped[dict | None] = mapped_column(JSONType)
    place_id: Mapped[int | None] = mapped_column(sa.ForeignKey("places.id", ondelete="SET NULL"))
    visit_id: Mapped[int | None] = mapped_column(
        sa.ForeignKey("visits.id", ondelete="SET NULL"), index=True
    )
    status: Mapped[str] = mapped_column(sa.String(16), default="pending")
    error: Mapped[str | None] = mapped_column(sa.Text)
    uploaded_at: Mapped[datetime] = mapped_column(UTCDateTime, server_default=sa.func.now())

    place: Mapped[Place | None] = relationship()
    visit: Mapped[Visit | None] = relationship(back_populates="images")
    analysis: Mapped["ImageAnalysis | None"] = relationship(
        back_populates="image", cascade="all, delete-orphan", uselist=False
    )
    expense: Mapped["Expense | None"] = relationship(
        back_populates="image", cascade="all, delete-orphan", uselist=False
    )


class ImageAnalysis(Base):
    __tablename__ = "image_analyses"

    image_id: Mapped[int] = mapped_column(
        sa.ForeignKey("images.id", ondelete="CASCADE"), primary_key=True
    )
    kind: Mapped[str] = mapped_column(sa.String(16))  # place|food|item|receipt|document|other
    caption: Mapped[str | None] = mapped_column(sa.Text)
    labels: Mapped[list | None] = mapped_column(JSONType)
    raw: Mapped[dict | None] = mapped_column(JSONType)
    model: Mapped[str | None] = mapped_column(sa.String(64))
    analyzed_at: Mapped[datetime] = mapped_column(UTCDateTime, server_default=sa.func.now())

    image: Mapped[Image] = relationship(back_populates="analysis")


class Expense(Base):
    __tablename__ = "expenses"
    __table_args__ = (sa.Index("ix_expenses_user_spent_at", "user_id", "spent_at"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(sa.ForeignKey("users.id", ondelete="CASCADE"), index=True)
    # Null for manually entered expenses (no receipt photo)
    image_id: Mapped[int | None] = mapped_column(
        sa.ForeignKey("images.id", ondelete="CASCADE"), unique=True
    )
    visit_id: Mapped[int | None] = mapped_column(sa.ForeignKey("visits.id", ondelete="SET NULL"))
    source: Mapped[str] = mapped_column(sa.String(16), default="receipt")  # receipt|manual
    # "What" — what the money went on ("Motorbike taxi", "Souvenir")
    description: Mapped[str | None] = mapped_column(sa.String(255))
    # "Where" — the place, as free text plus an optional resolved Place
    merchant: Mapped[str | None] = mapped_column(sa.String(255))
    place_id: Mapped[int | None] = mapped_column(sa.ForeignKey("places.id", ondelete="SET NULL"))
    spent_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    currency: Mapped[str] = mapped_column(sa.String(3), default="THB")
    total_minor: Mapped[int] = mapped_column(sa.BigInteger, default=0)
    tax_minor: Mapped[int | None] = mapped_column(sa.BigInteger)
    tip_minor: Mapped[int | None] = mapped_column(sa.BigInteger)
    # Conversion into the user's base currency
    base_currency: Mapped[str] = mapped_column(sa.String(3), default="THB")
    base_total_minor: Mapped[int | None] = mapped_column(sa.BigInteger)
    fx_rate: Mapped[Decimal | None] = mapped_column(sa.Numeric(20, 10))
    fx_rate_source: Mapped[str | None] = mapped_column(sa.String(16))  # same|api|manual
    # Foreign-currency spend waits for the user to confirm the rate
    needs_review: Mapped[bool] = mapped_column(sa.Boolean, default=False, index=True)
    note: Mapped[str | None] = mapped_column(sa.Text)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, server_default=sa.func.now())

    image: Mapped[Image | None] = relationship(back_populates="expense")
    visit: Mapped[Visit | None] = relationship(back_populates="expenses")
    place: Mapped[Place | None] = relationship()
    items: Mapped[list["ExpenseItem"]] = relationship(
        back_populates="expense", cascade="all, delete-orphan"
    )


class ExchangeRate(Base):
    """Daily FX cache: `rate` = units of to_currency per 1 from_currency."""

    __tablename__ = "exchange_rates"
    __table_args__ = (
        sa.UniqueConstraint(
            "from_currency", "to_currency", "as_of_date", name="uq_exchange_rates_pair_date"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    from_currency: Mapped[str] = mapped_column(sa.String(3))
    to_currency: Mapped[str] = mapped_column(sa.String(3))
    rate: Mapped[Decimal] = mapped_column(sa.Numeric(20, 10))
    as_of_date: Mapped[date] = mapped_column(sa.Date)
    fetched_at: Mapped[datetime] = mapped_column(UTCDateTime, server_default=sa.func.now())


class ExpenseItem(Base):
    __tablename__ = "expense_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    expense_id: Mapped[int] = mapped_column(
        sa.ForeignKey("expenses.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(sa.String(255))
    qty: Mapped[float] = mapped_column(sa.Float, default=1.0)
    unit_price_minor: Mapped[int | None] = mapped_column(sa.BigInteger)
    amount_minor: Mapped[int] = mapped_column(sa.BigInteger, default=0)

    expense: Mapped[Expense] = relationship(back_populates="items")
