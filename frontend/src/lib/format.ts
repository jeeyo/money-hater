import type { Spend } from '../types';

const ZERO_DECIMAL = new Set(['JPY', 'KRW', 'VND', 'CLP', 'ISK', 'UGX', 'RWF', 'XAF', 'XOF', 'XPF']);

export function formatMoney(totalMinor: number, currency: string): string {
  const amount = ZERO_DECIMAL.has(currency) ? totalMinor : totalMinor / 100;
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

export function toMinor(amount: number, currency: string): number {
  return Math.round(amount * (ZERO_DECIMAL.has(currency) ? 1 : 100));
}

export function toMajor(minor: number, currency: string): number {
  return ZERO_DECIMAL.has(currency) ? minor : minor / 100;
}

/** Spend totals always read in the base currency; foreign originals go in parentheses. */
export function formatSpend(spend: Spend): string {
  const base = formatMoney(spend.base_total_minor, spend.base_currency);
  const foreign = spend.by_currency.filter((c) => c.currency !== spend.base_currency);
  if (foreign.length === 0) return base;
  const detail = foreign.map((c) => formatMoney(c.total_minor, c.currency)).join(' + ');
  return `${base} (${detail})`;
}

export const COMMON_CURRENCIES = [
  'THB',
  'JPY',
  'USD',
  'EUR',
  'GBP',
  'SGD',
  'MYR',
  'VND',
  'KRW',
  'CNY',
  'HKD',
  'TWD',
  'AUD',
  'IDR',
  'PHP',
  'INR',
];

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** A trip with no ending expense is one you are still on. */
export function isOpenTrip(trip: { end_expense_id: number | null }): boolean {
  return trip.end_expense_id === null;
}

/**
 * "Sat, Aug 1, 2026 – now · 3 days". An open trip has no end to name, so its
 * range runs to now and the day count is what it is *today*.
 */
export function formatTripRange(trip: {
  end_expense_id: number | null;
  started_at: string;
  ended_at: string;
  day_count: number;
}): string {
  const days = `${trip.day_count} day${trip.day_count === 1 ? '' : 's'}`;
  if (isOpenTrip(trip)) return `${formatDay(trip.started_at)} – now · ${days}`;
  if (trip.day_count === 1) return `${formatDay(trip.started_at)} · ${days}`;
  return `${formatDay(trip.started_at)} – ${formatDay(trip.ended_at)} · ${days}`;
}

export function localDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Minutes east of UTC for the browser's timezone (JS offset is inverted). */
export function tzOffsetMinutes(): number {
  return -new Date().getTimezoneOffset();
}

export function shiftDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d + days);
  return localDateString(date);
}
