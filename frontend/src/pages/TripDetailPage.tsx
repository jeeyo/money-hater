import { ArrowLeft, Check, Pencil } from 'lucide-react';
import { Suspense, lazy, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

// maplibre-gl is heavy; load it only when a trip map is actually shown
const MapView = lazy(() =>
  import('../components/MapView').then((m) => ({ default: m.MapView })),
);
import { VisitCard } from '../components/VisitCard';
import { useTrip, useUpdateTrip } from '../hooks/useData';
import { formatDay, formatSpend } from '../lib/format';

export function TripDetailPage() {
  const { tripId } = useParams();
  const id = Number(tripId);
  const { data: trip, isLoading } = useTrip(id);
  const updateTrip = useUpdateTrip(id);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');

  const mapPoints = useMemo(
    () =>
      (trip?.visits ?? [])
        .filter((v) => v.lat != null && v.lng != null)
        .map((v) => ({ lat: v.lat!, lng: v.lng!, label: v.label })),
    [trip],
  );

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
          {formatDay(trip.started_at)} · {trip.kind}
          {trip.spend.length > 0 && (
            <> · spent <span className="font-semibold text-amber-700">{formatSpend(trip.spend)}</span></>
          )}
        </p>
      </header>

      {mapPoints.length > 0 && (
        <Suspense fallback={<div className="h-56 w-full animate-pulse rounded-2xl bg-slate-100 md:h-72" />}>
          <MapView points={mapPoints} className="h-56 w-full overflow-hidden rounded-2xl md:h-72" />
        </Suspense>
      )}

      <div className="space-y-3 border-l border-slate-200 [&>*]:-ml-px">
        {trip.visits.map((visit) => (
          <VisitCard key={visit.id} visit={visit} />
        ))}
      </div>
    </div>
  );
}
