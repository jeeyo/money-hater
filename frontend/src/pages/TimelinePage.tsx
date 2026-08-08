import { Briefcase, ChevronLeft, ChevronRight, Footprints, Plane } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ImageModal } from '../components/ImageModal';
import { ImageThumb } from '../components/ImageThumb';
import { VisitCard } from '../components/VisitCard';
import { useTimeline } from '../hooks/useData';
import { formatSpend, localDateString, shiftDate } from '../lib/format';
import type { ImageRecord, TripDetail } from '../types';

const KIND_ICON = { trip: Plane, commute: Briefcase, outing: Footprints };

function TripSection({ trip }: { trip: TripDetail }) {
  const Icon = KIND_ICON[trip.kind] ?? Footprints;
  return (
    <section className="space-y-3">
      <Link to={`/trips/${trip.id}`} className="flex items-center justify-between gap-2 px-1">
        <span className="flex min-w-0 items-center gap-2">
          <Icon className="size-4 shrink-0 text-brand-600" />
          <span className="truncate font-semibold text-slate-800">{trip.title}</span>
          <span className="shrink-0 text-xs text-slate-400">
            {trip.visit_count} stop{trip.visit_count === 1 ? '' : 's'}
          </span>
        </span>
        {trip.spend.length > 0 && (
          <span className="shrink-0 text-xs font-semibold text-amber-700">
            {formatSpend(trip.spend)}
          </span>
        )}
      </Link>
      <div className="space-y-3 border-l border-slate-200 [&>*]:-ml-px">
        {trip.visits.map((visit) => (
          <VisitCard key={visit.id} visit={visit} />
        ))}
      </div>
    </section>
  );
}

export function TimelinePage() {
  const [date, setDate] = useState(() => localDateString(new Date()));
  const { data, isLoading } = useTimeline(date);
  const [openImage, setOpenImage] = useState<ImageRecord | null>(null);

  const isEmpty =
    data && data.trips.length === 0 && data.unassigned_images.length === 0;

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between gap-2">
        <button
          type="button"
          aria-label="Previous day"
          onClick={() => setDate((d) => shiftDate(d, -1))}
          className="rounded-full p-2 text-slate-500 active:bg-slate-100"
        >
          <ChevronLeft className="size-5" />
        </button>
        <input
          type="date"
          value={date}
          onChange={(e) => e.target.value && setDate(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-800"
        />
        <button
          type="button"
          aria-label="Next day"
          onClick={() => setDate((d) => shiftDate(d, 1))}
          className="rounded-full p-2 text-slate-500 active:bg-slate-100"
        >
          <ChevronRight className="size-5" />
        </button>
      </header>

      {data && data.spend.length > 0 && (
        <p className="rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          Spent this day: <span className="font-semibold">{formatSpend(data.spend)}</span>
        </p>
      )}

      {isLoading && <p className="py-12 text-center text-sm text-slate-400">Loading day…</p>}

      {isEmpty && (
        <div className="py-16 text-center">
          <p className="text-slate-500">Nothing logged this day.</p>
          <Link to="/upload" className="mt-2 inline-block font-medium text-brand-600">
            Upload photos →
          </Link>
        </div>
      )}

      {data?.trips.map((trip) => <TripSection key={trip.id} trip={trip} />)}

      {data && data.unassigned_images.length > 0 && (
        <section className="space-y-2">
          <h2 className="px-1 text-sm font-semibold text-slate-500">Not yet placed</h2>
          <div className="flex flex-wrap gap-2">
            {data.unassigned_images.map((image) => (
              <ImageThumb key={image.id} image={image} onClick={() => setOpenImage(image)} />
            ))}
          </div>
        </section>
      )}
      {openImage && <ImageModal image={openImage} onClose={() => setOpenImage(null)} />}
    </div>
  );
}
