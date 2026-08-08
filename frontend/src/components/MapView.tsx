import maplibregl from 'maplibre-gl';
import { useEffect, useRef } from 'react';

export interface MapPoint {
  lat: number;
  lng: number;
  label: string;
}

const OSM_STYLE: maplibregl.StyleSpecification = {
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

export function MapView({ points, className }: { points: MapPoint[]; className?: string }) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!container.current || points.length === 0) return;
    const map = new maplibregl.Map({
      container: container.current,
      style: OSM_STYLE,
      center: [points[0].lng, points[0].lat],
      zoom: 13,
      attributionControl: { compact: true },
    });
    for (const [index, point] of points.entries()) {
      const el = document.createElement('div');
      el.className =
        'flex size-6 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white shadow';
      el.textContent = String(index + 1);
      new maplibregl.Marker({ element: el })
        .setLngLat([point.lng, point.lat])
        .setPopup(new maplibregl.Popup({ closeButton: false }).setText(point.label))
        .addTo(map);
    }
    if (points.length > 1) {
      const bounds = new maplibregl.LngLatBounds();
      for (const point of points) bounds.extend([point.lng, point.lat]);
      map.fitBounds(bounds, { padding: 48, maxZoom: 15 });
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }));
      map.on('load', () => {
        map.addSource('route', {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'LineString',
              coordinates: points.map((p) => [p.lng, p.lat]),
            },
          },
        });
        map.addLayer({
          id: 'route',
          type: 'line',
          source: 'route',
          paint: { 'line-color': '#059669', 'line-width': 3, 'line-dasharray': [1, 1.5] },
        });
      });
    }
    return () => map.remove();
  }, [points]);

  if (points.length === 0) return null;
  return <div ref={container} className={className ?? 'h-64 w-full rounded-2xl'} />;
}
