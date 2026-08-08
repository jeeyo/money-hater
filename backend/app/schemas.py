from datetime import datetime

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
    image_id: int
    visit_id: int | None
    merchant: str | None
    spent_at: datetime | None
    currency: str
    total_minor: int
    tax_minor: int | None
    tip_minor: int | None
    note: str | None
    items: list[ExpenseItemOut]


class ExpenseUpdate(BaseModel):
    merchant: str | None = None
    spent_at: datetime | None = None
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    total_minor: int | None = None
    note: str | None = None


class CurrencyTotal(BaseModel):
    currency: str
    total_minor: int


class MerchantTotal(BaseModel):
    merchant: str
    currency: str
    total_minor: int
    count: int


class ExpenseSummaryOut(BaseModel):
    totals: list[CurrencyTotal]
    by_merchant: list[MerchantTotal]


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
    spend: list[CurrencyTotal]


class TripOut(BaseModel):
    id: int
    title: str
    kind: str
    started_at: datetime
    ended_at: datetime
    pinned: bool
    visit_count: int
    image_count: int
    spend: list[CurrencyTotal]


class TripDetailOut(TripOut):
    visits: list[VisitOut]


class TimelineDayOut(BaseModel):
    date: str
    trips: list[TripDetailOut]
    unassigned_images: list[ImageOut]
    spend: list[CurrencyTotal]


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
