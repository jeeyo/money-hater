import { ArrowLeft, Check, Pencil, Trash2 } from 'lucide-react';
import { Suspense, lazy, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { VisitCard } from '../components/VisitCard';
import { useDeleteTrip, useTrip, useUpdateTrip } from '../hooks/useData';
import { dayColor } from '../lib/dayColors';
import { formatDay, formatSpend } from '../lib/format';

// maplibre-gl is heavy; load it only when a trip map is actually shown
const MapView = lazy(() => import('../components/MapView').then((m) => ({ default: m.MapView })));

export function TripDetailPage() {
  const { tripId } = useParams();
  const id = Number(tripId);
  const navigate = useNavigate();
  const { data: trip, isLoading } = useTrip(id);
  const updateTrip = useUpdateTrip(id);
  const deleteTrip = useDeleteTrip();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');

  // One route per day, so the map shows which stops belonged to which day
  const mapDays = useMemo(
    () =>
      (trip?.days ?? []).map((day, index) => ({
        label: `Day ${index + 1}`,
        points: day.visits
          .filter((v) => v.lat != null && v.lng != null)
          .map((v) => ({ lat: v.lat!, lng: v.lng!, label: v.label })),
      })),
    [trip],
  );
  const hasMapPoints = mapDays.some((day) => day.points.length > 0);

  if (isLoading) return <p className="py-12 text-center text-sm text-slate-400">Loading trip…</p>;
  if (!trip) return <p className="py-12 text-center text-sm text-slate-500">Trip not found.</p>;

  function saveTitle() {
    updateTrip.mutate({ title }, { onSuccess: () => setEditing(false) });
  }

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <Link to="/trips" className="inline-flex items-center gap-1 text-sm text-slate-500">
          <ArrowLeft className="size-4" /> Trips
        </Link>
        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <input
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && saveTitle()}
                className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-lg font-bold"
              />
              <button
                type="button"
                onClick={saveTitle}
                aria-label="Save title"
                className="rounded-full bg-brand-600 p-2 text-white"
              >
                <Check className="size-4" />
              </button>
            </>
          ) : (
            <>
              <h1 className="truncate text-xl font-bold text-slate-900">{trip.title}</h1>
              <button
                type="button"
                aria-label="Rename trip"
                onClick={() => {
                  setTitle(trip.title);
                  setEditing(true);
                }}
                className="rounded-full p-1.5 text-slate-400 active:bg-slate-100"
              >
                <Pencil className="size-4" />
              </button>
            </>
          )}
        </div>
        <p className="text-sm text-slate-500">
          {formatDay(trip.started_at)}
          {trip.day_count > 1 && <> – {formatDay(trip.ended_at)}</>} · {trip.day_count} day
          {trip.day_count === 1 ? '' : 's'}
          {trip.spend.base_total_minor > 0 && (
            <>
              {' '}
              · spent{' '}
              <span className="font-semibold text-amber-700">{formatSpend(trip.spend)}</span>
            </>
          )}
        </p>
      </header>

      {hasMapPoints && (
        <Suspense
          fallback={<div className="h-56 w-full animate-pulse rounded-2xl bg-slate-100 md:h-72" />}
        >
          <MapView days={mapDays} className="h-56 w-full overflow-hidden rounded-2xl md:h-72" />
        </Suspense>
      )}

      {trip.days.length === 0 && (
        <p className="rounded-2xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
          No photographed stops in this window yet — the expenses are still counted below.
        </p>
      )}

      {trip.days.map((day, index) => (
        <section key={day.date} className="space-y-3">
          <div className="flex items-baseline justify-between gap-2 px-1">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              {hasMapPoints && (
                <span
                  aria-hidden
                  className="h-0.5 w-4 shrink-0 rounded-full"
                  style={{ backgroundColor: dayColor(index, trip.days.length) }}
                />
              )}
              Day {index + 1}
              <span className="font-normal text-slate-400">{formatDay(day.date)}</span>
            </h2>
            {day.spend.base_total_minor > 0 && (
              <span className="text-xs font-semibold text-amber-700">
                {formatSpend(day.spend)}
              </span>
            )}
          </div>
          <div className="space-y-3 border-l border-slate-200 [&>*]:-ml-px">
            {day.visits.map((visit) => (
              <VisitCard key={visit.id} visit={visit} />
            ))}
          </div>
        </section>
      ))}

      <button
        type="button"
        onClick={() => {
          if (confirm(`Ungroup “${trip.title}”? The days and expenses stay.`)) {
            deleteTrip.mutate(trip.id, { onSuccess: () => navigate('/trips') });
          }
        }}
        className="flex items-center gap-1.5 text-sm font-medium text-rose-600"
      >
        <Trash2 className="size-4" /> Delete trip
      </button>
    </div>
  );
}
