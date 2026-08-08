import { describe, expect, it } from 'vitest';
import { formatMoney, formatSpend, shiftDate, toMajor, toMinor } from './format';

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

describe('shiftDate', () => {
  it('moves across month boundaries', () => {
    expect(shiftDate('2026-08-01', -1)).toBe('2026-07-31');
    expect(shiftDate('2026-12-31', 1)).toBe('2027-01-01');
  });
});
