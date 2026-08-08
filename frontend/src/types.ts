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
  spend: CurrencyTotal[];
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
  spend: CurrencyTotal[];
}

export interface TripDetail extends Trip {
  visits: Visit[];
}

export interface TimelineDay {
  date: string;
  trips: TripDetail[];
  unassigned_images: ImageRecord[];
  spend: CurrencyTotal[];
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
  image_id: number;
  visit_id: number | null;
  merchant: string | null;
  spent_at: string | null;
  currency: string;
  total_minor: number;
  tax_minor: number | null;
  tip_minor: number | null;
  note: string | null;
  items: ExpenseItem[];
}

export interface MerchantTotal {
  merchant: string;
  currency: string;
  total_minor: number;
  count: number;
}

export interface ExpenseSummary {
  totals: CurrencyTotal[];
  by_merchant: MerchantTotal[];
}
