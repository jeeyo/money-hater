import { ChevronRight, Luggage, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { NewTripSheet } from '../components/NewTripSheet';
import { useTrips } from '../hooks/useData';
import { formatDay, formatSpend } from '../lib/format';

export function TripsPage() {
  const { data: trips, isLoading } = useTrips();
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-slate-900">Trips</h1>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white active:bg-brand-700"
        >
          <Plus className="size-4" /> New
        </button>
      </header>

      {isLoading && <p className="py-12 text-center text-sm text-slate-400">Loading…</p>}

      {trips?.length === 0 && (
        <div className="py-16 text-center">
          <Luggage className="mx-auto size-8 text-slate-300" />
          <p className="mt-3 text-slate-500">No trips yet.</p>
          <p className="mx-auto mt-1 max-w-xs text-sm text-slate-400">
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
              className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 active:bg-slate-50"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                <Luggage className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-slate-900">{trip.title}</span>
                <span className="block text-xs text-slate-500">
                  {formatDay(trip.started_at)}
                  {trip.day_count > 1 && <> – {formatDay(trip.ended_at)}</>} · {trip.day_count} day
                  {trip.day_count === 1 ? '' : 's'} · {trip.image_count} photo
                  {trip.image_count === 1 ? '' : 's'}
                </span>
              </span>
              {trip.spend.base_total_minor > 0 && (
                <span className="shrink-0 text-xs font-semibold text-amber-700">
                  {formatSpend(trip.spend)}
                </span>
              )}
              <ChevronRight className="size-4 shrink-0 text-slate-300" />
            </Link>
          </li>
        ))}
      </ul>

      {creating && <NewTripSheet onClose={() => setCreating(false)} />}
    </div>
  );
}
