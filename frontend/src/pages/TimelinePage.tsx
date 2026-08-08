import { ChevronLeft, ChevronRight, Luggage } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ImageModal } from '../components/ImageModal';
import { ImageThumb } from '../components/ImageThumb';
import { VisitCard } from '../components/VisitCard';
import { useTimeline } from '../hooks/useData';
import { formatSpend, isOpenTrip, localDateString, shiftDate } from '../lib/format';
import type { ImageRecord } from '../types';

export function TimelinePage() {
  const [date, setDate] = useState(() => localDateString(new Date()));
  const { data, isLoading } = useTimeline(date);
  const [openImage, setOpenImage] = useState<ImageRecord | null>(null);

  const isEmpty = data && data.visits.length === 0 && data.unassigned_images.length === 0;

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between gap-2">
        <button
          type="button"
          aria-label="Previous day"
          onClick={() => setDate((d) => shiftDate(d, -1))}
          className="rounded-full p-2 text-ink-3 active:bg-surface-2"
        >
          <ChevronLeft className="size-5" />
        </button>
        <input
          type="date"
          value={date}
          onChange={(e) => e.target.value && setDate(e.target.value)}
          className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink"
        />
        <button
          type="button"
          aria-label="Next day"
          onClick={() => setDate((d) => shiftDate(d, 1))}
          className="rounded-full p-2 text-ink-3 active:bg-surface-2"
        >
          <ChevronRight className="size-5" />
        </button>
      </header>

      {data?.trip && (
        <Link
          to={`/trips/${data.trip.id}`}
          className="flex items-center gap-2 rounded-xl bg-brand-50 px-4 py-2.5 text-sm text-brand-700"
        >
          <Luggage className="size-4 shrink-0" />
          <span className="flex-1 truncate">
            Part of <span className="font-semibold">{data.trip.title}</span>
            {isOpenTrip(data.trip) && ' · ongoing'}
          </span>
          <ChevronRight className="size-4 shrink-0 text-brand-500" />
        </Link>
      )}

      {data && data.spend.base_total_minor > 0 && (
        <p className="rounded-xl bg-money-bg px-4 py-2.5 text-sm text-money">
          Spent this day: <span className="font-semibold">{formatSpend(data.spend)}</span>
        </p>
      )}

      {isLoading && <p className="py-12 text-center text-sm text-ink-4">Loading day…</p>}

      {isEmpty && (
        <div className="py-16 text-center">
          <p className="text-ink-3">Nothing logged this day.</p>
          <Link to="/upload" className="mt-2 inline-block font-medium text-brand-600">
            Upload photos →
          </Link>
        </div>
      )}

      {data && data.visits.length > 0 && (
        <div className="space-y-3 border-l border-line [&>*]:-ml-px">
          {data.visits.map((visit) => (
            <VisitCard key={visit.id} visit={visit} />
          ))}
        </div>
      )}

      {data && data.unassigned_images.length > 0 && (
        <section className="space-y-2">
          <h2 className="px-1 text-sm font-semibold text-ink-3">Not yet placed</h2>
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
