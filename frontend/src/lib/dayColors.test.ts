import { describe, expect, it } from 'vitest';
import { DAY_HUES, dayColor, dayDash } from './dayColors';

describe('dayColor', () => {
  it('gives each day its own hue, in a fixed order', () => {
    const colors = [0, 1, 2, 3].map((i) => dayColor(i, 4));
    expect(new Set(colors).size).toBe(4);
    expect(colors[0]).toBe(DAY_HUES[0]);
    // Day 3's colour does not depend on how long the trip is
    expect(dayColor(2, 4)).toBe(dayColor(2, 8));
  });

  it('never cycles a hue back onto a second day', () => {
    const long = Array.from({ length: 14 }, (_, i) => dayColor(i, 14));
    expect(new Set(long).size).toBe(14);
  });

  it('falls back to an ordered light-to-dark ramp past the hue set', () => {
    const total = DAY_HUES.length + 4;
    const first = dayColor(0, total);
    const last = dayColor(total - 1, total);
    expect(first).toMatch(/^rgb\(/);
    const lightness = (rgb: string) =>
      rgb
        .match(/\d+/g)!
        .map(Number)
        .reduce((a, b) => a + b, 0);
    // Later days are darker, so the ramp reads as early -> late
    expect(lightness(last)).toBeLessThan(lightness(first));
  });

  it('handles a single-day trip', () => {
    expect(dayColor(0, 1)).toBe(DAY_HUES[0]);
  });
});

describe('dayDash', () => {
  it('varies the pattern so adjacent routes differ by more than colour', () => {
    expect(dayDash(0)).not.toEqual(dayDash(1));
  });
});
