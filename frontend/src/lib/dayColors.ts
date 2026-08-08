/**
 * Colors for the days of a trip on the map.
 *
 * Days are categorical *and* ordered. Up to eight of them get distinct hues in
 * a fixed order (never cycled, so day 3 is always the same colour on a given
 * trip); longer trips switch to a single-hue light→dark ramp, which reads as
 * "early to late" and scales to any length. Lines also carry a dash pattern per
 * day, so two routes stay tellable apart when their colours sit side by side on
 * a busy basemap — and for anyone who can't separate the hues at all.
 */

// Validated categorical order (see dataviz reference palette)
export const DAY_HUES = [
  '#2a78d6', // blue
  '#eb6834', // orange
  '#1baf7a', // aqua
  '#eda100', // yellow
  '#e87ba4', // magenta
  '#008300', // green
  '#4a3aa7', // violet
  '#e34948', // red
];

// Ends of the sequential ramp used once a trip outgrows the hue set
const RAMP_FROM = [157, 199, 245]; // light blue
const RAMP_TO = [16, 60, 112]; // deep blue

/** Dash patterns in MapLibre's line-dasharray units (multiples of line width). */
export const DAY_DASHES: number[][] = [
  [1, 0], // solid
  [3, 1.5],
  [1, 1.5],
  [5, 2, 1, 2],
  [4, 2],
  [1, 1],
  [6, 2],
  [2, 1, 0.5, 1],
];

function rampColor(index: number, total: number): string {
  const t = total <= 1 ? 0 : index / (total - 1);
  const channel = (from: number, to: number) => Math.round(from + (to - from) * t);
  const [r, g, b] = RAMP_FROM.map((from, i) => channel(from, RAMP_TO[i]));
  return `rgb(${r}, ${g}, ${b})`;
}

export function dayColor(index: number, total: number): string {
  return total <= DAY_HUES.length ? DAY_HUES[index] : rampColor(index, total);
}

export function dayDash(index: number): number[] {
  return DAY_DASHES[index % DAY_DASHES.length];
}
