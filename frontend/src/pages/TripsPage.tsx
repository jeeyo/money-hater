import { Briefcase, ChevronRight, Footprints, Plane } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTrips } from '../hooks/useData';
import { formatDay, formatSpend } from '../lib/format';

const KIND_ICON = { trip: Plane, commute: Briefcase, outing: Footprints };

export function TripsPage() {
  const { data: trips, isLoading } = useTrips();

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-slate-900">Trips</h1>
      {isLoading && <p className="py-12 text-center text-sm text-slate-400">Loading…</p>}
      {trips?.length === 0 && (
        <p className="py-16 text-center text-sm text-slate-500">
          No trips yet — upload some photos and they'll appear here.
        </p>
      )}
      <ul className="space-y-2">
        {trips?.map((trip) => {
          const Icon = KIND_ICON[trip.kind] ?? Footprints;
          return (
            <li key={trip.id}>
              <Link
                to={`/trips/${trip.id}`}
                className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 active:bg-slate-50"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                  <Icon className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-slate-900">{trip.title}</span>
                  <span className="block text-xs text-slate-500">
                    {formatDay(trip.started_at)} · {trip.visit_count} stop
                    {trip.visit_count === 1 ? '' : 's'} · {trip.image_count} photo
                    {trip.image_count === 1 ? '' : 's'}
                  </span>
                </span>
                {trip.spend.length > 0 && (
                  <span className="shrink-0 text-xs font-semibold text-amber-700">
                    {formatSpend(trip.spend)}
                  </span>
                )}
                <ChevronRight className="size-4 shrink-0 text-slate-300" />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
