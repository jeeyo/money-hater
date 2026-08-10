import { describe, expect, it } from 'vitest';
import {
  formatDateTime,
  formatDay,
  formatMoney,
  formatMoneyCompact,
  formatSpanLabel,
  formatSpend,
  formatTime,
  formatTripRange,
  fromWallClockInput,
  isOpenTrip,
  parseLocalDate,
  shiftDate,
  shiftMonth,
  shiftSpan,
  spanAnchor,
  startOfWeek,
  toMajor,
  toMinor,
  toWallClockInput,
  wallClockDay,
} from './format';

describe('formatMoney', () => {
  it('divides minor units for decimal currencies', () => {
    expect(formatMoney(34550, 'THB')).toMatch(/345\.50/);
  });
  it('keeps zero-decimal currencies as-is', () => {
    expect(formatMoney(1200, 'JPY')).toMatch(/1,?200/);
  });
  it('falls back for unknown currency codes', () => {
    expect(formatMoney(1000, 'ZZZ')).toContain('ZZZ');
  });
});

describe('minor unit conversion', () => {
  it('round-trips decimal currencies', () => {
    expect(toMinor(345.5, 'THB')).toBe(34550);
    expect(toMajor(34550, 'THB')).toBe(345.5);
  });
  it('leaves zero-decimal currencies alone', () => {
    expect(toMinor(1200, 'JPY')).toBe(1200);
    expect(toMajor(1200, 'JPY')).toBe(1200);
  });
  it('rounds rather than truncating', () => {
    expect(toMinor(1200 * 0.2354, 'THB')).toBe(28248);
  });
});

describe('formatSpend', () => {
  const base = { base_currency: 'THB', unconfirmed_count: 0 };

  it('shows only the base total when nothing is foreign', () => {
    const text = formatSpend({
      ...base,
      base_total_minor: 34550,
      by_currency: [{ currency: 'THB', total_minor: 34550 }],
    });
    expect(text).toMatch(/345\.50/);
    expect(text).not.toContain('(');
  });

  it('appends what was actually paid for foreign spend', () => {
    const text = formatSpend({
      ...base,
      base_total_minor: 28200,
      by_currency: [{ currency: 'JPY', total_minor: 1200 }],
    });
    expect(text).toMatch(/282/);
    expect(text).toMatch(/\(.*1,?200.*\)/);
  });
});

describe('open trips', () => {
  const closed = {
    end_expense_id: 7,
    started_at: '2026-08-01T00:00:00Z',
    ended_at: '2026-08-03T23:59:59Z',
    day_count: 3,
  };
  const open = { ...closed, end_expense_id: null };

  it('reads openness from the missing ending expense', () => {
    expect(isOpenTrip(open)).toBe(true);
    expect(isOpenTrip(closed)).toBe(false);
  });

  it('runs an open trip to "now" rather than naming a last day', () => {
    expect(formatTripRange(open)).toMatch(/– now · 3 days$/);
  });

  it('names both ends of a finished trip', () => {
    const text = formatTripRange(closed);
    expect(text).toContain('–');
    expect(text).not.toContain('now');
    expect(text).toMatch(/3 days$/);
  });

  it('does not repeat the day of a one-day trip', () => {
    const text = formatTripRange({ ...closed, day_count: 1, ended_at: closed.started_at });
    expect(text).not.toContain('–');
    expect(text).toMatch(/1 day$/);
  });
});

describe('shiftDate', () => {
  it('moves across month boundaries', () => {
    expect(shiftDate('2026-08-01', -1)).toBe('2026-07-31');
    expect(shiftDate('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('parseLocalDate', () => {
  it('reads a date string as local midnight, not UTC', () => {
    const date = parseLocalDate('2026-08-09');
    expect([date.getFullYear(), date.getMonth(), date.getDate()]).toEqual([2026, 7, 9]);
  });
});

describe('startOfWeek', () => {
  it('backs up to the Monday whichever day it is given', () => {
    // 2026-08-03 is a Monday, 2026-08-09 the Sunday that ends the same week
    expect(startOfWeek('2026-08-03')).toBe('2026-08-03');
    expect(startOfWeek('2026-08-05')).toBe('2026-08-03');
    expect(startOfWeek('2026-08-09')).toBe('2026-08-03');
  });

  it('does not roll a Sunday into the week that follows it', () => {
    expect(startOfWeek('2026-08-10')).toBe('2026-08-10');
  });
});

describe('shiftMonth', () => {
  it('clamps the day rather than spilling into the next month', () => {
    expect(shiftMonth('2026-03-31', -1)).toBe('2026-02-28');
    expect(shiftMonth('2026-01-31', 1)).toBe('2026-02-28');
  });

  it('crosses the year', () => {
    expect(shiftMonth('2026-12-15', 1)).toBe('2027-01-15');
    expect(shiftMonth('2026-01-15', -1)).toBe('2025-12-15');
  });
});

describe('shiftSpan', () => {
  it('steps by what the view is showing', () => {
    expect(shiftSpan('2026-08-05', 'day', 1)).toBe('2026-08-06');
    expect(shiftSpan('2026-08-05', 'week', -1)).toBe('2026-07-29');
    expect(shiftSpan('2026-08-05', 'month', 1)).toBe('2026-09-05');
  });
});

describe('spanAnchor', () => {
  it('collapses every day of a span onto one cache key', () => {
    expect(spanAnchor('week', '2026-08-05')).toBe(spanAnchor('week', '2026-08-09'));
    expect(spanAnchor('month', '2026-08-31')).toBe('2026-08-01');
  });
});

describe('formatSpanLabel', () => {
  it('names a month', () => {
    expect(formatSpanLabel('month', '2026-08-01', '2026-08-31')).toMatch(/2026/);
  });

  it('names both ends of a week', () => {
    const text = formatSpanLabel('week', '2026-08-03', '2026-08-09');
    expect(text).toContain('3');
    expect(text).toContain('9');
    expect(text.match(/Aug/g)).toHaveLength(2);
  });

  it('names both months when a week straddles them', () => {
    const text = formatSpanLabel('week', '2026-07-27', '2026-08-02');
    expect(text).toMatch(/Jul/);
    expect(text).toMatch(/Aug/);
  });
});

describe('formatMoneyCompact', () => {
  it('shortens a calendar cell to something that fits', () => {
    expect(formatMoneyCompact(124000, 'THB')).toMatch(/1\.2K/i);
    expect(formatMoneyCompact(9500, 'THB')).toMatch(/95/);
  });
});


/**
 * Times from the API are wall clocks — the clock where the thing happened —
 * sent with a Z on the end because an ISO string needs one. Reading them in the
 * browser's timezone adds an offset to a clock that already has one baked in,
 * which is what put a 20:36 dinner in Bangkok at 03:36 the next morning.
 *
 * These run under whatever TZ the suite is given, so they assert the one thing
 * that must hold everywhere: what comes out is what went in.
 */
describe('stored moments read as the clock they were written on', () => {
  const dinner = '2026-08-10T20:36:12Z';

  it('shows the hour on the receipt, not the hour in your browser', () => {
    expect(formatTime(dinner)).toContain('36');
    expect(formatTime(dinner)).toMatch(/\b(20|08)\b/); // 24-hour or 12-hour locale
    expect(formatTime(dinner)).not.toContain('03');
  });

  it('keeps the day it happened on', () => {
    expect(formatDay(dinner)).toContain('10');
    expect(formatDay(dinner)).toMatch(/Aug/);
    expect(formatDateTime(dinner)).toContain('36');
    expect(wallClockDay(dinner)).toBe('2026-08-10');
  });

  it('round-trips through the datetime-local picker unchanged', () => {
    expect(toWallClockInput(dinner)).toBe('2026-08-10T20:36');
    expect(fromWallClockInput('2026-08-10T20:36')).toBe('2026-08-10T20:36:00Z');
    expect(wallClockDay(fromWallClockInput(toWallClockInput(dinner)))).toBe('2026-08-10');
  });

  it('names a trip by the days its bounds fall on', () => {
    const range = formatTripRange({
      end_expense_id: 2,
      started_at: '2026-08-10T00:00:00Z',
      ended_at: '2026-08-12T23:59:59Z',
      day_count: 3,
    });
    expect(range).toContain('10');
    expect(range).toContain('12');
  });
});
