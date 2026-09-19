/**
 * The basemap the app draws every route on.
 *
 * Raster OSM tiles, no API key, no server of ours: whatever renders this style
 * needs nothing but the viewer's internet.
 *
 * Its twin lives in `backend/app/services/export/basemap.py`, which draws the
 * map in an exported trip page. Nothing compiles the two together, so
 * `test_export.py` reads this file and fails if they drift — keep the literals
 * here simple enough to be read by eye, and change both at once.
 */
import type { StyleSpecification } from 'maplibre-gl';

export const OSM_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};

/** Dim and desaturate the light OSM raster so it sits under a dark page.
 *  Applied to the tile layer only, so the day routes keep their exact colours. */
export const DARK_BASEMAP_PAINT = {
  'raster-brightness-max': 0.3,
  'raster-saturation': -0.45,
  'raster-contrast': -0.1,
} as const;
