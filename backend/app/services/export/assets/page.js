// Everything this page knows, written into the document as data rather than
// baked into this script, so the script itself never changes.
const DATA = JSON.parse(document.getElementById('trip-data').textContent);
const DAYS = DATA.days;
const STYLE = DATA.style;
const DARK_PAINT = DATA.darkPaint;
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
