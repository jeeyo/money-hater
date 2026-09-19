/**
 * A trip as one HTML file you can send to someone.
 *
 * The page it writes has no build step, no framework and no account behind it:
 * the itinerary is pre-rendered markup, the photos are inlined as data URIs,
 * and the only JavaScript is the map — the same MapLibre basemap and per-day
 * routes the app draws (`lib/basemap`, `lib/dayColors`), loaded from a CDN.
 * Opened from a Downloads folder it needs the network for map tiles and that
 * script; everything else is in the file.
 *
 * Text is formatted here, at export time, rather than in the page: a shared
 * file should read the same for the person who sent it and the person who
 * opens it, and `Intl` in the recipient's browser would not promise that.
 */
import type { Expense, ImageRecord, TripDetail, Visit } from '../types';
import { DARK_BASEMAP_PAINT, OSM_STYLE } from './basemap';
import { dayColor, dayDash } from './dayColors';
import { formatDay, formatMoney, formatSpend, formatTime, isOpenTrip } from './format';

/** Kept in step with the app's own maplibre-gl — `tripExport.test.ts` fails if it drifts. */
export const EXPORT_MAPLIBRE_VERSION = '5.24.0';

const MAPLIBRE_JS = `https://cdn.jsdelivr.net/npm/maplibre-gl@${EXPORT_MAPLIBRE_VERSION}/dist/maplibre-gl.js`;
const MAPLIBRE_CSS = `https://cdn.jsdelivr.net/npm/maplibre-gl@${EXPORT_MAPLIBRE_VERSION}/dist/maplibre-gl.css`;

export interface TripExportOptions {
  /** Image id → data URI. Photos missing from the map are left out of the page. */
  photos: ReadonlyMap<number, string>;
  /** Off leaves out every amount: the badges, the expense lines, the total. */
  includeSpending: boolean;
  /** Overridable so the test can pin the date in the footer. */
  exportedAt?: Date;
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Every piece of user text goes through this — a place name is whatever the
 *  user typed, and it ends up in a file other people open. */
function esc(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

/** JSON for a `<script>` body: `</script>` inside a string would end the tag. */
function jsonLiteral(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

interface ExportPoint {
  lat: number;
  lng: number;
  label: string;
}

/** What the page's inline script needs: colours are resolved here, so the
 *  exported map has no palette logic of its own to drift from the app's. */
interface ExportMapDay {
  label: string;
  color: string;
  dash: number[];
  points: ExportPoint[];
}

function visitPoint(visit: Visit): ExportPoint | null {
  if (visit.lat == null || visit.lng == null) return null;
  return { lat: visit.lat, lng: visit.lng, label: visit.label };
}

function mapDays(trip: TripDetail): ExportMapDay[] {
  const days = trip.days.map((day, index) => ({
    label: `Day ${index + 1}`,
    points: day.visits.map(visitPoint).filter((point): point is ExportPoint => point !== null),
  }));
  // Days with nothing to plot are not days on the map, and they must not take a
  // colour with them: the legend and the route colours are indexed off the days
  // that made it, exactly as MapView does it.
  const withPoints = days.filter((day) => day.points.length > 0);
  return withPoints.map((day, index) => ({
    ...day,
    color: dayColor(index, withPoints.length),
    dash: dayDash(index),
  }));
}

/** The colour a day's heading swatch takes — its route's, or nothing if the
 *  day never made it onto the map. */
function headingColors(trip: TripDetail, plotted: ExportMapDay[]): (string | null)[] {
  let taken = 0;
  return trip.days.map((day) => {
    const hasPoints = day.visits.some((visit) => visit.lat != null && visit.lng != null);
    return hasPoints ? plotted[taken++].color : null;
  });
}

function photoTag(image: ImageRecord, src: string): string {
  const caption = image.analysis?.caption ?? 'photo';
  return [
    '<button type="button" class="photo">',
    `<img src="${src}" alt="${esc(caption)}" loading="lazy">`,
    '</button>',
  ].join('');
}

function photoRow(images: ImageRecord[], photos: ReadonlyMap<number, string>): string {
  const tags = images
    .map((image) => {
      const src = photos.get(image.id);
      return src ? photoTag(image, src) : '';
    })
    .filter(Boolean);
  return tags.length > 0 ? `<div class="photos">${tags.join('')}</div>` : '';
}

/** What the money went on, under the stop it was spent at. */
function expenseLine(expense: Expense): string {
  const where = expense.place?.name ?? expense.merchant;
  const what = expense.description ?? where ?? 'Expense';
  return [
    '<li>',
    `<span class="line-what">${esc(what)}</span>`,
    `<span class="line-amount">${esc(formatMoney(expense.total_minor, expense.currency))}</span>`,
    '</li>',
  ].join('');
}

function stopEntry(
  visit: Visit,
  options: TripExportOptions,
  color: string | null,
  number: number | null,
): string {
  const parts: string[] = [];
  const time =
    visit.ended_at !== visit.started_at
      ? `${formatTime(visit.started_at)} – ${formatTime(visit.ended_at)}`
      : formatTime(visit.started_at);
  const address = visit.place?.formatted_address;
  const pin =
    number !== null && color
      ? `<span class="pin" style="background:${color}">${number}</span>`
      : '';

  parts.push('<article class="entry">');
  parts.push(`<span class="dot dot-stop"${color ? ` style="--dot:${color}"` : ''}></span>`);
  parts.push('<div class="card">');
  parts.push('<div class="card-head">');
  parts.push('<div class="card-title">');
  parts.push(`<p class="name">${pin}${esc(visit.label)}</p>`);
  parts.push(
    `<p class="sub">${esc(time)}${address ? ` · <span class="addr">${esc(address)}</span>` : ''}</p>`,
  );
  parts.push('</div>');
  if (options.includeSpending && visit.spend.base_total_minor > 0) {
    parts.push(`<span class="badge">${esc(formatSpend(visit.spend))}</span>`);
  }
  parts.push('</div>');
  parts.push(photoRow(visit.images, options.photos));
  if (options.includeSpending && visit.expenses.length > 0) {
    parts.push(`<ul class="lines">${visit.expenses.map(expenseLine).join('')}</ul>`);
  }
  parts.push('</div></article>');
  return parts.join('');
}

/** Spending that belongs to no stop — a fare, a tip — as an entry of its own,
 *  the way the app's timeline rail shows it. */
function expenseEntry(expense: Expense): string {
  const where = expense.place?.name ?? expense.merchant;
  const title = expense.description ?? where ?? 'Expense';
  const subtitle = expense.description && where ? where : expense.note;
  const amount =
    expense.base_total_minor != null
      ? formatMoney(expense.base_total_minor, expense.base_currency)
      : formatMoney(expense.total_minor, expense.currency);
  const sub = [expense.spent_at ? formatTime(expense.spent_at) : '', subtitle ?? '']
    .filter(Boolean)
    .join(' · ');

  return [
    '<article class="entry">',
    '<span class="dot dot-money"></span>',
    '<div class="card card-quiet">',
    '<div class="card-head">',
    '<div class="card-title">',
    `<p class="name">${esc(title)}</p>`,
    sub ? `<p class="sub">${esc(sub)}</p>` : '',
    '</div>',
    `<span class="badge">${esc(amount)}</span>`,
    '</div></div></article>',
  ].join('');
}

/** One day as a single chronological rail, stops and loose spending together —
 *  the same ordering rule as `DayRail`, with undated expenses last. */
function dayEntries(
  visits: Visit[],
  expenses: Expense[],
  options: TripExportOptions,
  color: string | null,
): string {
  let plotted = 0;
  const rows = [
    ...visits.map((visit) => {
      const number = visit.lat != null && visit.lng != null ? ++plotted : null;
      return { at: visit.started_at, html: stopEntry(visit, options, color, number) };
    }),
    ...(options.includeSpending
      ? expenses.map((expense) => ({
          at: expense.spent_at ?? '9999',
          html: expenseEntry(expense),
        }))
      : []),
  ].sort((a, b) => a.at.localeCompare(b.at));

  if (rows.length === 0) return '<p class="empty">Nothing logged on this day.</p>';
  return `<div class="rail">${rows.map((row) => row.html).join('')}</div>`;
}

function daySection(
  trip: TripDetail,
  index: number,
  options: TripExportOptions,
  color: string | null,
): string {
  const day = trip.days[index];
  const swatch = color ? `<span class="swatch" style="background:${color}"></span>` : '';
  const spend =
    options.includeSpending && day.spend.base_total_minor > 0
      ? `<span class="day-spend">${esc(formatSpend(day.spend))}</span>`
      : '';
  return [
    '<section class="day">',
    '<h2>',
    swatch,
    `Day ${index + 1}`,
    `<span class="day-date">${esc(formatDay(day.date))}</span>`,
    spend,
    '</h2>',
    dayEntries(day.visits, day.expenses, options, color),
    '</section>',
  ].join('');
}

/** "Sat, Aug 1, 2026 – Sun, Aug 2, 2026 · 2 days". Never "– now": a file is
 *  read long after it was written, and an open trip's `ended_at` is the day it
 *  was exported on, which is what the range should say. */
function rangeLine(trip: TripDetail): string {
  const days = `${trip.day_count} day${trip.day_count === 1 ? '' : 's'}`;
  if (trip.day_count === 1) return `${formatDay(trip.started_at)} · ${days}`;
  return `${formatDay(trip.started_at)} – ${formatDay(trip.ended_at)} · ${days}`;
}

function header(trip: TripDetail, options: TripExportOptions): string {
  const parts: string[] = ['<header class="head">'];
  parts.push(`<h1>${esc(trip.title)}</h1>`);
  parts.push(`<p class="range">${esc(rangeLine(trip))}`);
  if (options.includeSpending && trip.spend.base_total_minor > 0) {
    parts.push(` · spent <span class="total">${esc(formatSpend(trip.spend))}</span>`);
  }
  parts.push('</p>');
  if (isOpenTrip(trip)) {
    parts.push('<p class="ongoing">Still going when this page was made</p>');
  }
  if (trip.note) parts.push(`<p class="note">${esc(trip.note)}</p>`);
  parts.push('</header>');
  return parts.join('');
}

function legend(days: ExportMapDay[]): string {
  if (days.length < 2) return '';
  const items = days
    .map(
      (day) =>
        `<li><span class="key" style="background:${day.color}"></span>${esc(day.label)}</li>`,
    )
    .join('');
  return `<ul class="legend">${items}</ul>`;
}

const STYLES = `
:root {
  color-scheme: light;
  --canvas: #f8fafc;
  --surface: #ffffff;
  --surface-2: #f1f5f9;
  --line: #e2e8f0;
  --line-soft: #f1f5f9;
  --ink: #0f172a;
  --ink-2: #334155;
  --ink-3: #64748b;
  --ink-4: #94a3b8;
  --money: #b45309;
  --money-bg: #fffbeb;
  --brand: #10b981;
}
@media (prefers-color-scheme: dark) {
  :root {
    color-scheme: dark;
    --canvas: #000000;
    --surface: #000000;
    --surface-2: #131313;
    --line: #2a2a2a;
    --line-soft: #1c1c1c;
    --ink: #fafafa;
    --ink-2: #d4d4d4;
    --ink-3: #a1a1a1;
    --ink-4: #737373;
    --money: #fbbf24;
    --money-bg: #221803;
    --brand: #34d399;
  }
  /* The basemap is dimmed with MapLibre's raster paint properties, which leaves
     the route colours alone. Only the map chrome needs flipping. */
  .maplibregl-ctrl-attrib, .maplibregl-ctrl-group { filter: invert(1) hue-rotate(180deg); }
}
* { box-sizing: border-box; }
body {
  margin: 0;
  padding: 20px 16px 48px;
  background: var(--canvas);
  color: var(--ink);
  font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
}
.page { max-width: 720px; margin: 0 auto; }
h1 { margin: 0; font-size: 22px; line-height: 1.25; }
.head { margin-bottom: 16px; }
.range { margin: 4px 0 0; color: var(--ink-3); font-size: 14px; }
.total { color: var(--money); font-weight: 600; }
.ongoing {
  display: inline-block;
  margin: 8px 0 0;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--surface-2);
  color: var(--ink-2);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.note { margin: 8px 0 0; color: var(--ink-2); font-size: 14px; }
#map { height: 260px; border-radius: 16px; overflow: hidden; background: var(--surface-2); }
.legend { display: flex; flex-wrap: wrap; gap: 4px 16px; margin: 8px 0 0; padding: 0 4px; list-style: none; }
.legend li { display: flex; align-items: center; gap: 6px; color: var(--ink-2); font-size: 12px; }
.key { width: 20px; height: 2px; border-radius: 999px; }
.day { margin-top: 24px; }
.day h2 {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 0 0 12px;
  padding: 0 4px;
  font-size: 14px;
  color: var(--ink-2);
}
.swatch { width: 16px; height: 2px; border-radius: 999px; align-self: center; flex: none; }
.day-date { font-weight: 400; color: var(--ink-4); }
.day-spend { margin-left: auto; color: var(--money); font-weight: 600; font-size: 12px; }
.rail { border-left: 1px solid var(--line); display: flex; flex-direction: column; gap: 12px; }
.entry { position: relative; margin-left: -1px; padding-left: 24px; }
.dot { position: absolute; left: -5px; top: 10px; width: 10px; height: 10px; border-radius: 999px; }
.dot-stop { background: var(--dot, var(--brand)); box-shadow: 0 0 0 4px var(--canvas); }
.dot-money { background: var(--money); box-shadow: 0 0 0 4px var(--canvas); }
.card {
  border: 1px solid var(--line);
  border-radius: 16px;
  background: var(--surface);
  padding: 12px;
}
.card-quiet { border-color: var(--line-soft); }
.card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
.card-title { min-width: 0; }
.name { margin: 0; font-weight: 500; display: flex; align-items: center; gap: 6px; }
.pin {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 999px;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
}
.sub { margin: 2px 0 0; color: var(--ink-3); font-size: 12px; }
.addr { color: var(--ink-4); }
.badge {
  flex: none;
  border-radius: 999px;
  background: var(--money-bg);
  color: var(--money);
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.photos { display: flex; gap: 8px; overflow-x: auto; margin-top: 8px; padding-bottom: 4px; }
.photo {
  flex: none;
  width: 96px;
  height: 96px;
  padding: 0;
  border: 0;
  border-radius: 12px;
  overflow: hidden;
  background: var(--surface-2);
  cursor: zoom-in;
}
.photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
.lines { margin: 8px 0 0; padding: 8px 0 0; border-top: 1px solid var(--line-soft); list-style: none; }
.lines li { display: flex; justify-content: space-between; gap: 8px; font-size: 12px; }
.line-what { color: var(--ink-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.line-amount { flex: none; color: var(--ink-3); font-variant-numeric: tabular-nums; }
.empty {
  margin: 0;
  border-radius: 16px;
  background: var(--surface-2);
  padding: 20px;
  text-align: center;
  color: var(--ink-3);
  font-size: 14px;
}
.foot { margin-top: 32px; text-align: center; color: var(--ink-4); font-size: 12px; }
.lightbox {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(0, 0, 0, 0.85);
  cursor: zoom-out;
}
.lightbox[hidden] { display: none; }
.lightbox img { max-width: 100%; max-height: 100%; border-radius: 12px; }
@media (min-width: 640px) {
  body { padding: 32px 24px 64px; }
  h1 { font-size: 26px; }
  #map { height: 340px; }
}
`;

/** The page's only script: the map, and tap-to-enlarge on a photo. */
function pageScript(days: ExportMapDay[]): string {
  return `
const DAYS = ${jsonLiteral(days)};
const STYLE = ${jsonLiteral(OSM_STYLE)};
const DARK_PAINT = ${jsonLiteral(DARK_BASEMAP_PAINT)};
const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
const all = DAYS.flatMap(function (day) { return day.points; });

if (all.length > 0) {
  const map = new maplibregl.Map({
    container: 'map',
    style: STYLE,
    center: [all[0].lng, all[0].lat],
    zoom: 12,
    attributionControl: { compact: true },
  });
  DAYS.forEach(function (day) {
    day.points.forEach(function (point, stopIndex) {
      const el = document.createElement('div');
      el.className = 'marker';
      el.style.cssText =
        'display:flex;align-items:center;justify-content:center;width:24px;height:24px;' +
        'border-radius:999px;color:#fff;font:700 12px sans-serif;box-shadow:0 0 0 2px var(--surface);' +
        'background:' + day.color;
      el.textContent = String(stopIndex + 1);
      new maplibregl.Marker({ element: el })
        .setLngLat([point.lng, point.lat])
        .setPopup(new maplibregl.Popup({ closeButton: false }).setText(day.label + ' · ' + point.label))
        .addTo(map);
    });
  });
  if (all.length > 1) {
    const bounds = new maplibregl.LngLatBounds();
    all.forEach(function (point) { bounds.extend([point.lng, point.lat]); });
    map.fitBounds(bounds, { padding: 48, maxZoom: 15 });
  }
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }));
  // 'style.load' rather than 'load', so an unreachable tile server holds up the
  // basemap only — the routes need the style, which is inline above.
  map.on('style.load', function () {
    if (dark) {
      Object.keys(DARK_PAINT).forEach(function (property) {
        map.setPaintProperty('osm', property, DARK_PAINT[property]);
      });
    }
    DAYS.forEach(function (day, dayIndex) {
      if (day.points.length < 2) return;
      const id = 'route-' + dayIndex;
      map.addSource(id, {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: day.points.map(function (p) { return [p.lng, p.lat]; }),
          },
        },
      });
      map.addLayer({
        id: id,
        type: 'line',
        source: id,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': day.color, 'line-width': 3, 'line-dasharray': day.dash },
      });
    });
  });
}

const lightbox = document.getElementById('lightbox');
const lightboxImage = lightbox.querySelector('img');
document.addEventListener('click', function (event) {
  const photo = event.target instanceof Element ? event.target.closest('.photo') : null;
  if (photo) {
    const image = photo.querySelector('img');
    lightboxImage.src = image.src;
    lightboxImage.alt = image.alt;
    lightbox.hidden = false;
    return;
  }
  if (!lightbox.hidden) lightbox.hidden = true;
});
document.addEventListener('keydown', function (event) {
  if (event.key === 'Escape') lightbox.hidden = true;
});
`;
}

/** The whole trip as one self-contained HTML document. */
export function buildTripHtml(trip: TripDetail, options: TripExportOptions): string {
  const days = mapDays(trip);
  const colors = headingColors(trip, days);
  const exportedAt = options.exportedAt ?? new Date();
  const sections =
    trip.days.length > 0
      ? trip.days.map((_, index) => daySection(trip, index, options, colors[index])).join('')
      : '<p class="empty">Nothing was logged on this trip.</p>';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(trip.title)}</title>
<meta name="description" content="${esc(`${trip.title} — ${rangeLine(trip)}`)}">
<link rel="stylesheet" href="${MAPLIBRE_CSS}">
<style>${STYLES}</style>
</head>
<body>
<main class="page">
${header(trip, options)}
${days.length > 0 ? `<div id="map"></div>${legend(days)}` : ''}
${sections}
<footer class="foot">
Made with Money Hater · ${esc(formatDay(exportedAt.toISOString()))} · map tiles © OpenStreetMap contributors
</footer>
</main>
<div class="lightbox" id="lightbox" hidden><img alt=""></div>
<script src="${MAPLIBRE_JS}"></script>
<script>${pageScript(days)}</script>
</body>
</html>
`;
}

/** "bangkok-2026-08-01.html" — the title, or the date alone if it has no letters. */
export function tripExportFilename(trip: TripDetail): string {
  const slug = trip.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  const start = trip.started_at.slice(0, 10);
  return `${slug ? `${slug}-${start}` : `trip-${start}`}.html`;
}

/** Every photo the page would show, in the order it shows them. */
export function exportablePhotos(trip: TripDetail): ImageRecord[] {
  return trip.days.flatMap((day) =>
    day.visits.flatMap((visit) => visit.images.filter((image) => image.thumb_url)),
  );
}
