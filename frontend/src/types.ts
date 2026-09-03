export interface User {
  id: number;
  email: string;
  preferred_currency: string;
  home_lat: number | null;
  home_lng: number | null;
  home_label: string | null;
}

export interface AuthConfig {
  /** Null unless the server has Turnstile configured. */
  turnstile_site_key: string | null;
}

export interface Place {
  id: number;
  name: string;
  formatted_address: string | null;
  lat: number;
  lng: number;
  types: string[] | null;
}

export interface PlaceSuggestion extends Place {
  distance_m: number | null;
  source: 'visited' | 'google';
}

export interface Analysis {
  kind: 'place' | 'food' | 'item' | 'receipt' | 'document' | 'other';
  caption: string | null;
  labels: string[] | null;
}

export interface ImageRecord {
  id: number;
  mime: string;
  taken_at: string | null;
  exif_taken_at: string | null;
  taken_at_source: 'exif' | 'receipt' | 'upload' | 'custom';
  lat: number | null;
  lng: number | null;
  status: 'pending' | 'processing' | 'analyzed' | 'failed';
  error: string | null;
  uploaded_at: string;
  visit_id: number | null;
  place: Place | null;
  analysis: Analysis | null;
  original_url: string;
  thumb_url: string | null;
  has_expense: boolean;
}

export interface CurrencyTotal {
  currency: string;
  total_minor: number;
}

/** Spend rolled up into the user's base currency (THB by default). */
export interface Spend {
  base_currency: string;
  base_total_minor: number;
  by_currency: CurrencyTotal[];
  unconfirmed_count: number;
}

export interface Visit {
  id: number;
  label: string;
  place: Place | null;
  started_at: string;
  ended_at: string;
  lat: number | null;
  lng: number | null;
  pinned: boolean;
  images: ImageRecord[];
  spend: Spend;
}

/** A trip is optional: a grouping the user makes by picking two expenses. */
export interface Trip {
  id: number;
  title: string;
  note: string | null;
  start_expense_id: number;
  /** Null while the trip is still going; `ended_at` then reports today. */
  end_expense_id: number | null;
  started_at: string;
  ended_at: string;
  day_count: number;
  visit_count: number;
  image_count: number;
  spend: Spend;
}

export interface TripDay {
  date: string;
  visits: Visit[];
  spend: Spend;
}

export interface TripDetail extends Trip {
  days: TripDay[];
  expenses: Expense[];
}

export interface Recommendation {
  google_place_id: string;
  name: string;
  category: string | null;
  why: string | null;
  event: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  rating: number | null;
  user_rating_count: number | null;
  price_level: string | null;
  open_now: boolean | null;
  distance_m: number | null;
}

export interface TripRecommendations {
  /** none = nothing fresh; the panel offers to generate */
  status: 'none' | 'pending' | 'ready' | 'failed';
  moment: string | null;
  generated_at: string | null;
  anchor_label: string | null;
  items: Recommendation[];
  error: string | null;
}

export interface PlaceReview {
  author: string | null;
  rating: number | null;
  text: string;
  relative_time: string | null;
}

export interface PlaceDetails {
  id: number;
  google_place_id: string;
  name: string;
  formatted_address: string | null;
  lat: number;
  lng: number;
  types: string[] | null;
  rating: number | null;
  user_rating_count: number | null;
  price_level: string | null;
  open_now: boolean | null;
  opening_hours: string[] | null;
  summary: string | null;
  website: string | null;
  maps_uri: string | null;
  reviews: PlaceReview[];
}

export interface TripRef {
  id: number;
  title: string;
  end_expense_id: number | null;
}

export interface TimelineDay {
  date: string;
  trip: TripRef | null;
  visits: Visit[];
  unassigned_images: ImageRecord[];
  spend: Spend;
}

export type TimelineSpan = 'week' | 'month';

/** A day seen from a week or a month away: counts and a few frames, not contents. */
export interface TimelineDaySummary {
  date: string;
  trip: TripRef | null;
  /** Visit labels in order, so a row can read "Wat Pho · Menya Itto" */
  stops: string[];
  visit_count: number;
  image_count: number;
  thumbs: ImageRecord[];
  spend: Spend;
}

export interface TimelineRange {
  span: TimelineSpan;
  start: string;
  end: string;
  /** Every day in the span, empty ones included, so a calendar grid lines up */
  days: TimelineDaySummary[];
  trips: TripRef[];
  spend: Spend;
}

export interface ExpenseItem {
  id: number;
  name: string;
  qty: number;
  unit_price_minor: number | null;
  amount_minor: number;
}

export interface Expense {
  id: number;
  image_id: number | null;
  visit_id: number | null;
  source: 'receipt' | 'manual';
  /** What the money went on */
  description: string | null;
  /** Where it was spent — free text, plus a resolved Place when picked */
  merchant: string | null;
  place: Place | null;
  spent_at: string | null;
  currency: string;
  total_minor: number;
  tax_minor: number | null;
  tip_minor: number | null;
  base_currency: string;
  base_total_minor: number | null;
  fx_rate: number | null;
  fx_rate_source: 'same' | 'api' | 'manual' | null;
  needs_review: boolean;
  note: string | null;
  items: ExpenseItem[];
}

export interface ExpensePage {
  expenses: Expense[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

export interface MerchantTotal {
  merchant: string;
  base_currency: string;
  base_total_minor: number;
  count: number;
}

export interface ExpenseSummary {
  spend: Spend;
  by_merchant: MerchantTotal[];
  needs_review_count: number;
}

export interface RateQuote {
  from_currency: string;
  to_currency: string;
  rate: number | null;
  converted_minor: number | null;
}
