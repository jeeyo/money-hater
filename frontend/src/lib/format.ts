import type { Spend, TimelineSpan } from '../types';

const ZERO_DECIMAL = new Set(['JPY', 'KRW', 'VND', 'CLP', 'ISK', 'UGX', 'RWF', 'XAF', 'XOF', 'XPF']);

export function formatMoney(totalMinor: number, currency: string): string {
  const amount = ZERO_DECIMAL.has(currency) ? totalMinor : totalMinor / 100;
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

/** Shortened to fit a calendar cell: "฿1.2K" rather than "THB 1,240.00". The
 *  narrow symbol matters as much as the compact number — a month cell on a
 *  phone is about six characters wide, and "THB " alone eats four of them. */
export function formatMoneyCompact(totalMinor: number, currency: string): string {
  const amount = ZERO_DECIMAL.has(currency) ? totalMinor : totalMinor / 100;
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
      notation: 'compact',
      maximumFractionDigits: amount >= 1000 ? 1 : 0,
    }).format(amount);
  } catch {
    return `${Math.round(amount)} ${currency}`;
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

/** A YYYY-MM-DD as local midnight. `new Date(str)` would read it as UTC and,
 *  west of Greenwich, hand back the day before. */
export function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Move by whole months, clamping the day: 31 Jan back a month is 28 Feb. */
export function shiftMonth(dateStr: string, months: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const target = new Date(y, m - 1 + months, 1);
  const lastOfMonth = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(d, lastOfMonth));
  return localDateString(target);
}

/** The Monday of the week a day falls in — the week the server groups by. */
export function startOfWeek(dateStr: string): string {
  const weekday = parseLocalDate(dateStr).getDay(); // 0 = Sunday
  return shiftDate(dateStr, -((weekday + 6) % 7));
}

/** The first day of the span a date falls in — the span's stable cache key, so
 *  every day of the same week asks the server for the same week. */
export function spanAnchor(span: TimelineSpan, dateStr: string): string {
  return span === 'week' ? startOfWeek(dateStr) : `${dateStr.slice(0, 7)}-01`;
}

/** Step a span by one: a day, a week, or a calendar month. */
export function shiftSpan(dateStr: string, span: TimelineSpan | 'day', steps: number): string {
  if (span === 'month') return shiftMonth(dateStr, steps);
  return shiftDate(dateStr, steps * (span === 'week' ? 7 : 1));
}

/** "August 2026", or "Aug 3 – Aug 9, 2026" for a week no month name covers.
 *  Both ends name their month even when it is the same one: dropping it reads
 *  as "3 – Aug 9" in a month-first locale, which is worse than the repetition. */
export function formatSpanLabel(span: TimelineSpan, start: string, end: string): string {
  const from = parseLocalDate(start);
  const to = parseLocalDate(end);
  if (span === 'month') {
    return from.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }
  return [
    from.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
    to.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }),
  ].join(' – ');
}
