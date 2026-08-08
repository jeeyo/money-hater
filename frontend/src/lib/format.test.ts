import { describe, expect, it } from 'vitest';
import { formatMoney, shiftDate } from './format';

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

describe('shiftDate', () => {
  it('moves across month boundaries', () => {
    expect(shiftDate('2026-08-01', -1)).toBe('2026-07-31');
    expect(shiftDate('2026-12-31', 1)).toBe('2027-01-01');
  });
});
