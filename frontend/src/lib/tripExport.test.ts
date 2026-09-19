import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Expense, ImageRecord, TripDay, TripDetail, Visit } from '../types';
import { DAY_HUES } from './dayColors';
import {
  EXPORT_MAPLIBRE_VERSION,
  buildTripHtml,
  exportablePhotos,
  tripExportFilename,
} from './tripExport';

const PIXEL = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';

function spend(baseTotalMinor: number) {
  return {
    base_currency: 'THB',
    base_total_minor: baseTotalMinor,
    by_currency: [{ currency: 'THB', total_minor: baseTotalMinor }],
    unconfirmed_count: 0,
  };
}

function image(id: number, caption: string | null = null): ImageRecord {
  return {
    id,
    mime: 'image/jpeg',
    taken_at: '2026-08-01T09:12:00Z',
    exif_taken_at: null,
    taken_at_source: 'exif',
    lat: 13.74,
    lng: 100.49,
    status: 'analyzed',
    error: null,
    uploaded_at: '2026-08-01T09:12:00Z',
    visit_id: 1,
    place: null,
    analysis: caption ? { kind: 'place', caption, labels: null } : null,
    original_url: `/api/images/${id}/file`,
    thumb_url: `/api/images/${id}/thumb`,
    has_expense: false,
  };
}

function expense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 1,
    image_id: null,
    visit_id: null,
    subscription_id: null,
    source: 'manual',
    description: 'Taxi to the airport',
    merchant: null,
    place: null,
    spent_at: '2026-08-01T18:40:00Z',
    currency: 'THB',
    total_minor: 24000,
    tax_minor: null,
    tip_minor: null,
    base_currency: 'THB',
    base_total_minor: 24000,
    fx_rate: null,
    fx_rate_source: 'same',
    needs_review: false,
    note: null,
    items: [],
    ...overrides,
  };
}

function visit(overrides: Partial<Visit> = {}): Visit {
  return {
    id: 1,
    label: 'Wat Pho',
    place: null,
    started_at: '2026-08-01T09:12:00Z',
    ended_at: '2026-08-01T10:40:00Z',
    lat: 13.7466,
    lng: 100.4927,
    pinned: false,
    images: [],
    expenses: [],
    spend: spend(0),
    ...overrides,
  };
}

function day(date: string, overrides: Partial<TripDay> = {}): TripDay {
  return { date, visits: [], expenses: [], spend: spend(0), ...overrides };
}

function trip(overrides: Partial<TripDetail> = {}): TripDetail {
  return {
    id: 7,
    title: 'Bangkok',
    note: null,
    start_expense_id: 1,
    end_expense_id: 2,
    started_at: '2026-08-01T08:00:00Z',
    ended_at: '2026-08-02T22:00:00Z',
    day_count: 2,
    visit_count: 1,
    image_count: 0,
    spend: spend(0),
    days: [day('2026-08-01', { visits: [visit()] }), day('2026-08-02')],
    expenses: [],
    ...overrides,
  };
}

function render(detail: TripDetail, options: Partial<Parameters<typeof buildTripHtml>[1]> = {}) {
  return buildTripHtml(detail, {
    photos: new Map(),
    includeSpending: true,
    exportedAt: new Date('2026-09-19T00:00:00Z'),
    ...options,
  });
}

describe('buildTripHtml', () => {
  it('carries the trip over: title, range, stops and times', () => {
    const html = render(trip());
    expect(html).toContain('<title>Bangkok</title>');
    expect(html).toContain('Wat Pho');
    expect(html).toMatch(/2 days/);
    // The map ships as data, not as a screenshot
    expect(html).toContain('maplibregl.Map');
    expect(html).toContain('13.7466');
  });

  it('escapes user text rather than letting it become markup', () => {
    const html = render(
      trip({
        title: '<script>alert(1)</script>',
        days: [day('2026-08-01', { visits: [visit({ label: 'Bar & "Grill"' })] })],
      }),
    );
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('Bar &amp; &quot;Grill&quot;');
  });

  it('never lets a label close the inlined script tag', () => {
    const html = render(
      trip({ days: [day('2026-08-01', { visits: [visit({ label: '</script><b>x' })] })] }),
    );
    // The only </script> in the file are the two that really end its scripts
    expect(html.match(/<\/script>/g)).toHaveLength(2);
  });

  it('inlines the photos it was given and leaves out the ones it was not', () => {
    const detail = trip({
      days: [
        day('2026-08-01', {
          visits: [visit({ images: [image(11, 'the reclining buddha'), image(12)] })],
        }),
      ],
    });
    const html = render(detail, { photos: new Map([[11, PIXEL]]) });
    expect(html).toContain(`src="${PIXEL}"`);
    expect(html).toContain('alt="the reclining buddha"');
    expect(html).not.toContain('/api/images/12/thumb');
    expect(html.match(/<img/g)).toHaveLength(2); // the photo, plus the lightbox's
  });

  it('leaves every amount out when spending is excluded', () => {
    const detail = trip({
      spend: spend(325400),
      days: [
        day('2026-08-01', {
          visits: [visit({ spend: spend(12000), expenses: [expense({ description: 'Iced latte' })] })],
          expenses: [expense({ id: 2, description: 'Taxi' })],
          spend: spend(36000),
        }),
      ],
    });

    const withMoney = render(detail);
    expect(withMoney).toContain('Iced latte');
    expect(withMoney).toContain('Taxi');
    expect(withMoney).toMatch(/3,254|3254/);

    const without = render(detail, { includeSpending: false });
    expect(without).not.toContain('Iced latte');
    expect(without).not.toContain('Taxi');
    expect(without).not.toMatch(/3,254|3254/);
    expect(without).toContain('Wat Pho'); // the itinerary itself stays
  });

  it('colours each plotted day off the days that made it onto the map', () => {
    const detail = trip({
      days: [
        day('2026-08-01'), // nothing with a location
        day('2026-08-02', { visits: [visit({ id: 2, label: 'Jodd Fairs' })] }),
      ],
    });
    const html = render(detail);
    // The one route on the map is the first colour, though it is the trip's
    // second day — exactly how MapView indexes it.
    expect(html).toContain(DAY_HUES[0]);
    expect(html).not.toContain(DAY_HUES[1]);
    expect(html).toContain('Nothing logged on this day.');
  });

  it('says an open trip was still going, and dates it to the export', () => {
    const html = render(trip({ end_expense_id: null }));
    expect(html).toContain('Still going when this page was made');
    expect(html).not.toContain('– now');
  });

  it('pins maplibre to the version the app itself uses', () => {
    const lock = JSON.parse(
      readFileSync(new URL('../../package-lock.json', import.meta.url), 'utf8'),
    );
    expect(EXPORT_MAPLIBRE_VERSION).toBe(lock.packages['node_modules/maplibre-gl'].version);
    expect(render(trip())).toContain(`maplibre-gl@${EXPORT_MAPLIBRE_VERSION}`);
  });
});

describe('tripExportFilename', () => {
  it('slugifies the title and dates the file', () => {
    expect(tripExportFilename(trip())).toBe('bangkok-2026-08-01.html');
    expect(tripExportFilename(trip({ title: 'Chiang Mai & back!' }))).toBe(
      'chiang-mai-back-2026-08-01.html',
    );
  });

  it('falls back when the title has nothing to slugify', () => {
    expect(tripExportFilename(trip({ title: '🎌' }))).toBe('trip-2026-08-01.html');
  });
});

describe('exportablePhotos', () => {
  it('lists only photos that have a thumbnail to inline', () => {
    const pending = { ...image(13), thumb_url: null };
    const detail = trip({
      days: [day('2026-08-01', { visits: [visit({ images: [image(11), pending] })] })],
    });
    expect(exportablePhotos(detail).map((i) => i.id)).toEqual([11]);
  });
});
