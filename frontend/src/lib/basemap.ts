/**
 * The basemap the app draws every route on.
 *
 * Lives here rather than in MapView because the trip export builds a standalone
 * page with the same map in it (see `tripExport.ts`), and that page is written
 * by code that must not pull maplibre-gl into the bundle — hence the type-only
 * import below, which compiles away entirely.
 *
 * Raster OSM tiles, no API key, no server of ours: whatever renders this style
 * needs nothing but the viewer's internet.
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
