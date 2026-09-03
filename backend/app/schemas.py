from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, EmailStr, Field


# --- Auth / user ---
class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    # Cloudflare Turnstile's response token. Ignored — and absent — when
    # Turnstile is not configured, which is the default.
    turnstile_token: str | None = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str
    turnstile_token: str | None = None


class AuthConfigOut(BaseModel):
    """What the sign-in form needs to know before anyone has signed in.

    The site key is public by design, and it reaches the browser at runtime
    rather than being baked in at build time: the container image is built once
    and configured by whoever runs it.
    """

    turnstile_site_key: str | None


class UserOut(BaseModel):
    id: int
    email: str
    preferred_currency: str
    home_lat: float | None
    home_lng: float | None
    home_label: str | None


class SettingsUpdate(BaseModel):
    preferred_currency: str | None = Field(default=None, min_length=3, max_length=3)
    # Bounded, which also turns away NaN — it compares false against everything
    home_lat: float | None = Field(default=None, ge=-90, le=90)
    home_lng: float | None = Field(default=None, ge=-180, le=180)
    home_label: str | None = None


# --- Places ---
class PlaceOut(BaseModel):
    id: int
    name: str
    formatted_address: str | None
    lat: float
    lng: float
    types: list | None


class PlaceSuggestion(PlaceOut):
    # Distance from where the user was at the time of the expense
    distance_m: float | None
    source: str  # visited|google


class PlaceReview(BaseModel):
    author: str | None
    rating: float | None
    text: str
    relative_time: str | None


class PlaceDetailsOut(PlaceOut):
    """The pricier half of a place, fetched only when a card is opened."""

    google_place_id: str
    rating: float | None
    user_rating_count: int | None
    price_level: str | None
    open_now: bool | None
    opening_hours: list[str] | None
    summary: str | None
    website: str | None
    maps_uri: str | None
    reviews: list[PlaceReview]


# --- Images ---
class AnalysisOut(BaseModel):
    kind: str
    caption: str | None
    labels: list | None


class ImageOut(BaseModel):
    id: int
    mime: str
    taken_at: datetime | None
    exif_taken_at: datetime | None
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
    description: str | None
    merchant: str | None
    place: PlaceOut | None
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


class ExpensePageOut(BaseModel):
    """The "All expenses" list, most recent first, paginated a page at a time."""

    expenses: list[ExpenseOut]
    page: int
    page_size: int
    total: int
    total_pages: int


class ExpenseItemIn(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    qty: float = 1.0
    amount: Decimal


class ExpenseCreate(BaseModel):
    """Amounts are in major units — what a person types (e.g. 425.50)."""

    total: Decimal = Field(gt=0)
    currency: str = Field(min_length=3, max_length=3)
    description: str | None = Field(default=None, max_length=255)
    merchant: str | None = Field(default=None, max_length=255)
    place_id: int | None = None
    spent_at: datetime | None = None
    note: str | None = None
    tax: Decimal | None = None
    tip: Decimal | None = None
    fx_rate: Decimal | None = Field(default=None, gt=0)
    items: list[ExpenseItemIn] = []
    # A photo the vision model didn't read as a receipt (or misread), force-
    # attached by the user instead of the pipeline. Recorded as source=receipt,
    # same as one the model got right.
    image_id: int | None = None


class ExpenseUpdate(BaseModel):
    # Bounded like ExpenseCreate above: both write the same varchar(255)
    # columns, so a length only the create path checked was a 500 on edit.
    description: str | None = Field(default=None, max_length=255)
    merchant: str | None = Field(default=None, max_length=255)
    place_id: int | None = None
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
    label: str
    place: PlaceOut | None
    started_at: datetime
    ended_at: datetime
    lat: float | None
    lng: float | None
    pinned: bool
    images: list[ImageOut]
    spend: SpendOut


class TripRef(BaseModel):
    """Just enough to show "part of <trip>" and link to it."""

    id: int
    title: str
    # Null means the trip is still going, so the chip can say so.
    end_expense_id: int | None


class TripOut(BaseModel):
    id: int
    title: str
    note: str | None
    start_expense_id: int
    # Null while the trip is open; `ended_at` then reports today.
    end_expense_id: int | None
    started_at: datetime
    ended_at: datetime
    day_count: int
    visit_count: int
    image_count: int
    spend: SpendOut


class TripDayOut(BaseModel):
    date: str
    visits: list[VisitOut]
    spend: SpendOut


class TripDetailOut(TripOut):
    days: list[TripDayOut]
    expenses: list["ExpenseOut"]


class TripCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    start_expense_id: int
    # Omit (or send null) for a trip you are still on.
    end_expense_id: int | None = None
    note: str | None = None


class TripUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    start_expense_id: int | None = None
    # An explicit null reopens the trip; absent leaves the end alone.
    end_expense_id: int | None = None
    note: str | None = None


class TripEnd(BaseModel):
    """Close an open trip. Omit the expense to end it at the latest one."""

    end_expense_id: int | None = None


class RecommendationOut(BaseModel):
    google_place_id: str
    name: str
    category: str | None
    why: str | None
    event: str | None
    address: str | None
    lat: float | None
    lng: float | None
    rating: float | None = None
    user_rating_count: int | None = None
    price_level: str | None = None
    open_now: bool | None = None
    distance_m: int | None = None


class RecommendationsOut(BaseModel):
    # none = nothing generated yet (or it went stale); the UI offers the button
    status: str  # none|pending|ready|failed
    moment: str | None = None
    generated_at: datetime | None = None
    anchor_label: str | None = None
    items: list[RecommendationOut] = []
    error: str | None = None


class RecommendationRequest(BaseModel):
    # Force a new run even when a fresh set exists
    refresh: bool = False


class TimelineDayOut(BaseModel):
    date: str
    trip: TripRef | None
    visits: list[VisitOut]
    unassigned_images: list[ImageOut]
    spend: SpendOut


class TimelineDaySummaryOut(BaseModel):
    """A day as it reads from a week or month away: counts, not contents.

    Zooming out means many days at once, so the full visits and their photos
    would be a payload nobody looks at. What survives is what a cell or a row
    can actually show — where you went, how much of it there was, what it cost,
    and a few frames to recognise the day by.
    """

    date: str
    trip: TripRef | None
    # Visit labels in order, so a row can read "Wat Pho · Menya Itto"
    stops: list[str]
    visit_count: int
    image_count: int
    thumbs: list[ImageOut]
    spend: SpendOut


class TimelineRangeOut(BaseModel):
    span: str  # week|month
    # Inclusive local first and last day, YYYY-MM-DD
    start: str
    end: str
    # Every day in the span, empty ones included, so a calendar grid lines up
    days: list[TimelineDaySummaryOut]
    trips: list[TripRef]
    spend: SpendOut


class VisitUpdate(BaseModel):
    label_override: str | None = None
    # Free text, not an id: it is searched for ("Menya Itto"), and the place it
    # resolves to becomes the stop's. Named `google_place_id` until now, which
    # invited callers to send a `ChIJ…` id that would have been searched for as
    # a literal string and found nothing.
    place_query: str | None = None


class ImageAssignRequest(BaseModel):
    visit_id: int | None


class ImageUpdate(BaseModel):
    """Corrections to what was read off a photo. Omitted fields are left alone.

    Two ways to say where a photo was, because the picker has two. `place_id`
    is a suggestion the user chose, already a cached Place row (see
    /places/suggest). `place_query` is a name they typed that matched no
    suggestion — searched for, exactly as a stop's `place_query` is, so that
    somewhere the log has never seen can still be named. Sending both uses the
    id.
    """

    place_id: int | None = None
    place_query: str | None = None
    # A value is a user override; explicit null restores the preserved EXIF
    # value. Omission leaves the time untouched.
    taken_at: datetime | None = None
