from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, EmailStr, Field


# --- Auth / user ---
class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: int
    email: str
    preferred_currency: str
    home_lat: float | None
    home_lng: float | None
    home_label: str | None


class SettingsUpdate(BaseModel):
    preferred_currency: str | None = Field(default=None, min_length=3, max_length=3)
    home_lat: float | None = None
    home_lng: float | None = None
    home_label: str | None = None


# --- Places ---
class PlaceOut(BaseModel):
    id: int
    name: str
    formatted_address: str | None
    lat: float
    lng: float
    types: list | None


# --- Images ---
class AnalysisOut(BaseModel):
    kind: str
    caption: str | None
    labels: list | None


class ImageOut(BaseModel):
    id: int
    mime: str
    taken_at: datetime | None
    taken_at_source: str
    lat: float | None
    lng: float | None
    status: str
    error: str | None
    uploaded_at: datetime
    visit_id: int | None
    place: PlaceOut | None
    analysis: AnalysisOut | None
    original_url: str
    thumb_url: str | None
    has_expense: bool


# --- Expenses ---
class ExpenseItemOut(BaseModel):
    id: int
    name: str
    qty: float
    unit_price_minor: int | None
    amount_minor: int


class ExpenseOut(BaseModel):
    id: int
    image_id: int | None
    visit_id: int | None
    source: str
    merchant: str | None
    spent_at: datetime | None
    currency: str
    total_minor: int
    tax_minor: int | None
    tip_minor: int | None
    base_currency: str
    base_total_minor: int | None
    fx_rate: float | None
    fx_rate_source: str | None
    needs_review: bool
    note: str | None
    items: list[ExpenseItemOut]


class ExpenseItemIn(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    qty: float = 1.0
    amount: Decimal


class ExpenseCreate(BaseModel):
    """Amounts are in major units — what a person types (e.g. 425.50)."""

    total: Decimal = Field(gt=0)
    currency: str = Field(min_length=3, max_length=3)
    merchant: str | None = None
    spent_at: datetime | None = None
    note: str | None = None
    tax: Decimal | None = None
    tip: Decimal | None = None
    fx_rate: Decimal | None = Field(default=None, gt=0)
    items: list[ExpenseItemIn] = []


class ExpenseUpdate(BaseModel):
    merchant: str | None = None
    spent_at: datetime | None = None
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    total: Decimal | None = Field(default=None, gt=0)
    fx_rate: Decimal | None = Field(default=None, gt=0)
    note: str | None = None


class ExpenseConfirm(BaseModel):
    """Accept the suggested rate (omit fx_rate) or override it."""

    fx_rate: Decimal | None = Field(default=None, gt=0)


class RateOut(BaseModel):
    from_currency: str
    to_currency: str
    rate: float | None
    converted_minor: int | None = None


class CurrencyTotal(BaseModel):
    currency: str
    total_minor: int


class SpendOut(BaseModel):
    """Spend rolled up into the user's base currency."""

    base_currency: str
    base_total_minor: int
    # Original currencies, so a foreign trip still shows what was actually paid
    by_currency: list[CurrencyTotal]
    unconfirmed_count: int


class MerchantTotal(BaseModel):
    merchant: str
    base_currency: str
    base_total_minor: int
    count: int


class ExpenseSummaryOut(BaseModel):
    spend: SpendOut
    by_merchant: list[MerchantTotal]
    needs_review_count: int


# --- Visits / trips / timeline ---
class VisitOut(BaseModel):
    id: int
    trip_id: int
    label: str
    place: PlaceOut | None
    started_at: datetime
    ended_at: datetime
    lat: float | None
    lng: float | None
    pinned: bool
    images: list[ImageOut]
    spend: SpendOut


class TripOut(BaseModel):
    id: int
    title: str
    kind: str
    started_at: datetime
    ended_at: datetime
    pinned: bool
    visit_count: int
    image_count: int
    spend: SpendOut


class TripDetailOut(TripOut):
    visits: list[VisitOut]


class TimelineDayOut(BaseModel):
    date: str
    trips: list[TripDetailOut]
    unassigned_images: list[ImageOut]
    spend: SpendOut


class TripUpdate(BaseModel):
    title: str | None = None
    kind: str | None = Field(default=None, pattern="^(trip|commute|outing)$")


class VisitUpdate(BaseModel):
    label_override: str | None = None
    google_place_id: str | None = None


class TripMergeRequest(BaseModel):
    other_trip_id: int


class ImageAssignRequest(BaseModel):
    visit_id: int | None
