export interface User {
  id: number;
  email: string;
  preferred_currency: string;
  home_lat: number | null;
  home_lng: number | null;
  home_label: string | null;
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
  taken_at_source: 'exif' | 'receipt' | 'upload';
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
  trip_id: number;
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

export interface Trip {
  id: number;
  title: string;
  kind: 'trip' | 'commute' | 'outing';
  started_at: string;
  ended_at: string;
  pinned: boolean;
  visit_count: number;
  image_count: number;
  spend: Spend;
}

export interface TripDetail extends Trip {
  visits: Visit[];
}

export interface TimelineDay {
  date: string;
  trips: TripDetail[];
  unassigned_images: ImageRecord[];
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
