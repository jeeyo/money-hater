import { ArrowLeft, Check, Flag, Pencil, Trash2 } from 'lucide-react';
import { Suspense, lazy, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { EndTripSheet } from '../components/EndTripSheet';
import { RecommendationsPanel } from '../components/RecommendationsPanel';
import { VisitCard } from '../components/VisitCard';
import { useDeleteTrip, useEndTrip, useTrip, useUpdateTrip } from '../hooks/useData';
import { dayColor } from '../lib/dayColors';
import { formatDay, formatSpend, formatTripRange, isOpenTrip } from '../lib/format';

// maplibre-gl is heavy; load it only when a trip map is actually shown
const MapView = lazy(() => import('../components/MapView').then((m) => ({ default: m.MapView })));

export function TripDetailPage() {
  const { tripId } = useParams();
  const id = Number(tripId);
  const navigate = useNavigate();
  const { data: trip, isLoading } = useTrip(id);
  const updateTrip = useUpdateTrip(id);
  const deleteTrip = useDeleteTrip();
  const endTrip = useEndTrip(id);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [choosingEnd, setChoosingEnd] = useState(false);

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

  if (isLoading) return <p className="py-12 text-center text-sm text-ink-4">Loading trip…</p>;
  if (!trip) return <p className="py-12 text-center text-sm text-ink-3">Trip not found.</p>;

  function saveTitle() {
    updateTrip.mutate({ title }, { onSuccess: () => setEditing(false) });
  }

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <Link to="/trips" className="inline-flex items-center gap-1 text-sm text-ink-3">
          <ArrowLeft className="size-4" /> Trips
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          {editing ? (
            <>
              <input
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && saveTitle()}
                className="min-w-0 flex-1 rounded-lg border border-line-strong px-3 py-1.5 text-lg font-bold"
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
              <h1 className="truncate text-xl font-bold text-ink">{trip.title}</h1>
              {isOpenTrip(trip) && (
                <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-brand-700">
                  Ongoing · day {trip.day_count}
                </span>
              )}
              <button
                type="button"
                aria-label="Rename trip"
                onClick={() => {
                  setTitle(trip.title);
                  setEditing(true);
                }}
                className="rounded-full p-1.5 text-ink-4 active:bg-surface-2"
              >
                <Pencil className="size-4" />
              </button>
            </>
          )}
        </div>
        <p className="text-sm text-ink-3">
          {formatTripRange(trip)}
          {trip.spend.base_total_minor > 0 && (
            <>
              {' '}
              · spent{' '}
              <span className="font-semibold text-money">{formatSpend(trip.spend)}</span>
            </>
          )}
        </p>
      </header>

      {isOpenTrip(trip) && (
        <>
          <div className="space-y-2 rounded-2xl border border-line bg-surface p-3">
            <p className="text-sm text-ink-3">
              This trip is still running — today and everything you log from here joins it.
            </p>
            <button
              type="button"
              onClick={() => endTrip.mutate({})}
              disabled={endTrip.isPending}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white active:bg-brand-700 disabled:opacity-50"
            >
              <Flag className="size-4" /> {endTrip.isPending ? 'Ending…' : 'End trip now'}
            </button>
            <button
              type="button"
              onClick={() => setChoosingEnd(true)}
              className="w-full text-center text-xs text-ink-3 underline underline-offset-2"
            >
              Ended earlier? Pick the expense it ended with
            </button>
            {endTrip.isError && (
              <p className="text-center text-sm text-danger">{endTrip.error.message}</p>
            )}
          </div>

          {/* Its own card: ending the trip and deciding where to go next are
              different jobs, and the suggestions want the full width. */}
          <RecommendationsPanel tripId={trip.id} />
        </>
      )}

      {hasMapPoints && (
        <Suspense
          fallback={<div className="h-56 w-full animate-pulse rounded-2xl bg-surface-2 md:h-72" />}
        >
          <MapView days={mapDays} className="h-56 w-full overflow-hidden rounded-2xl md:h-72" />
        </Suspense>
      )}

      {trip.days.length === 0 && (
        <p className="rounded-2xl bg-surface-2 px-4 py-6 text-center text-sm text-ink-3">
          No photographed stops in this window yet — the expenses are still counted below.
        </p>
      )}

      {trip.days.map((day, index) => (
        <section key={day.date} className="space-y-3">
          <div className="flex items-baseline justify-between gap-2 px-1">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-2">
              {hasMapPoints && (
                <span
                  aria-hidden
                  className="h-0.5 w-4 shrink-0 rounded-full"
                  style={{ backgroundColor: dayColor(index, trip.days.length) }}
                />
              )}
              Day {index + 1}
              <span className="font-normal text-ink-4">{formatDay(day.date)}</span>
            </h2>
            {day.spend.base_total_minor > 0 && (
              <span className="text-xs font-semibold text-money">
                {formatSpend(day.spend)}
              </span>
            )}
          </div>
          <div className="space-y-3 border-l border-line [&>*]:-ml-px">
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
        className="flex items-center gap-1.5 text-sm font-medium text-danger"
      >
        <Trash2 className="size-4" /> Delete trip
      </button>

      {choosingEnd && <EndTripSheet trip={trip} onClose={() => setChoosingEnd(false)} />}
    </div>
  );
}
