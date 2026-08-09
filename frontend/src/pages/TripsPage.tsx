import { ChevronRight, Luggage, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { NewTripSheet } from '../components/NewTripSheet';
import { useTrips } from '../hooks/useData';
import { formatSpend, formatTripRange, isOpenTrip } from '../lib/format';

export function TripsPage() {
  const { data: trips, isLoading } = useTrips();
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-ink">Trips</h1>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white active:bg-brand-700"
        >
          <Plus className="size-4" /> New
        </button>
      </header>

      {isLoading && <p className="py-12 text-center text-sm text-ink-4">Loading…</p>}

      {trips?.length === 0 && (
        <div className="py-16 text-center">
          <Luggage className="mx-auto size-8 text-ink-4" />
          <p className="mt-3 text-ink-3">No trips yet.</p>
          <p className="mx-auto mt-1 max-w-xs text-sm text-ink-4">
            Your days are logged automatically. Make a trip when you want to group some of them —
            a holiday, a work visit — by picking the expense it started and ended with.
          </p>
        </div>
      )}

      <ul className="space-y-2">
        {trips?.map((trip) => (
          <li key={trip.id}>
            <Link
              to={`/trips/${trip.id}`}
              className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 active:bg-surface-2"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                <Luggage className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-ink">{trip.title}</span>
                <span className="block text-xs text-ink-3">
                  {isOpenTrip(trip) && (
                    <span className="mr-1.5 rounded-full bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-700">
                      Ongoing
                    </span>
                  )}
                  {formatTripRange(trip)} · {trip.image_count} photo
                  {trip.image_count === 1 ? '' : 's'}
                </span>
              </span>
              {trip.spend.base_total_minor > 0 && (
                <span className="shrink-0 text-xs font-semibold text-money">
                  {formatSpend(trip.spend)}
                </span>
              )}
              <ChevronRight className="size-4 shrink-0 text-ink-4" />
            </Link>
          </li>
        ))}
      </ul>

      {creating && <NewTripSheet onClose={() => setCreating(false)} />}
    </div>
  );
}
