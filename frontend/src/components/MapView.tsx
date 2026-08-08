import maplibregl from 'maplibre-gl';
import { useEffect, useRef } from 'react';
import { dayColor, dayDash } from '../lib/dayColors';

export interface MapPoint {
  lat: number;
  lng: number;
  label: string;
}

export interface MapDay {
  /** Shown in the legend, e.g. "Day 2" */
  label: string;
  points: MapPoint[];
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

function marker(color: string, text: string): HTMLElement {
  const el = document.createElement('div');
  el.className =
    'flex size-6 items-center justify-center rounded-full text-xs font-bold text-white shadow ring-2 ring-white';
  el.style.backgroundColor = color;
  el.textContent = text;
  return el;
}

/** One route per day, each in its own colour and dash pattern. */
export function MapView({ days, className }: { days: MapDay[]; className?: string }) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const withPoints = days.filter((day) => day.points.length > 0);
    if (!container.current || withPoints.length === 0) return;

    const all = withPoints.flatMap((day) => day.points);
    const map = new maplibregl.Map({
      container: container.current,
      style: OSM_STYLE,
      center: [all[0].lng, all[0].lat],
      zoom: 12,
      attributionControl: { compact: true },
    });

    withPoints.forEach((day, dayIndex) => {
      const color = dayColor(dayIndex, withPoints.length);
      day.points.forEach((point, stopIndex) => {
        new maplibregl.Marker({ element: marker(color, String(stopIndex + 1)) })
          .setLngLat([point.lng, point.lat])
          .setPopup(
            new maplibregl.Popup({ closeButton: false }).setText(
              `${day.label} · ${point.label}`,
            ),
          )
          .addTo(map);
      });
    });

    if (all.length > 1) {
      const bounds = new maplibregl.LngLatBounds();
      for (const point of all) bounds.extend([point.lng, point.lat]);
      map.fitBounds(bounds, { padding: 48, maxZoom: 15 });
    }
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }));

    map.on('load', () => {
      withPoints.forEach((day, dayIndex) => {
        if (day.points.length < 2) return;
        const id = `route-${dayIndex}`;
        map.addSource(id, {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'LineString',
              coordinates: day.points.map((p) => [p.lng, p.lat]),
            },
          },
        });
        map.addLayer({
          id,
          type: 'line',
          source: id,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': dayColor(dayIndex, withPoints.length),
            'line-width': 3,
            'line-dasharray': dayDash(dayIndex),
          },
        });
      });
    });

    return () => map.remove();
  }, [days]);

  const withPoints = days.filter((day) => day.points.length > 0);
  if (withPoints.length === 0) return null;

  return (
    <div className="space-y-2">
      <div ref={container} className={className ?? 'h-64 w-full rounded-2xl'} />
      {withPoints.length > 1 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 px-1">
          {withPoints.map((day, index) => (
            <li key={day.label} className="flex items-center gap-1.5 text-xs text-slate-600">
              <span
                aria-hidden
                className="h-0.5 w-5 rounded-full"
                style={{ backgroundColor: dayColor(index, withPoints.length) }}
              />
              {day.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
