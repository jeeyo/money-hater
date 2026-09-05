import { ChevronLeft, ChevronRight, Luggage } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { DayRail } from '../components/DayRail';
import { ImageModal } from '../components/ImageModal';
import { ImageThumb } from '../components/ImageThumb';
import { MonthView } from '../components/MonthView';
import { WeekView } from '../components/WeekView';
import { useTimeline, useTimelineRange } from '../hooks/useData';
import {
  formatSpanLabel,
  formatSpend,
  isOpenTrip,
  localDateString,
  shiftSpan,
  spanAnchor,
  startOfWeek,
} from '../lib/format';
import type { ImageRecord, TimelineRange, TimelineSpan, TripRef } from '../types';

type View = 'day' | TimelineSpan;

const VIEWS: { id: View; label: string }[] = [
  { id: 'day', label: 'Day' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
];

function isView(value: string | null): value is View {
  return VIEWS.some((view) => view.id === value);
}

/** Spend counts as something logged: a week of nothing but a manual expense is
 *  not an empty week, even though no photograph made it into the grid. */
function isSpanEmpty(range: TimelineRange): boolean {
  return (
    range.spend.base_total_minor === 0 &&
    range.days.every((day) => day.visit_count + day.image_count === 0)
  );
}

/** The date the view is anchored on — a day, or any day inside the span. */
function useTimelineParams() {
  const [params, setParams] = useSearchParams();
  const view: View = isView(params.get('view')) ? (params.get('view') as View) : 'day';
  const date = params.get('date') ?? localDateString(new Date());

  // One writer for both: switching view keeps the date, and picking a day out
  // of a week or a month keeps you in the URL rather than in component state,
  // so back goes back and a link to a day is a link to a day.
  function go(next: { view?: View; date?: string }) {
    setParams({ view: next.view ?? view, date: next.date ?? date });
  }

  return { view, date, go };
}

export function TimelinePage() {
  const { view, date, go } = useTimelineParams();
  const today = localDateString(new Date());
  const [openImage, setOpenImage] = useState<ImageRecord | null>(null);
  const [pageDirection, setPageDirection] = useState<1 | -1>(1);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  function page(steps: 1 | -1) {
    setPageDirection(steps);
    go({ date: shiftSpan(date, view, steps) });
  }

  function finishSwipe(event: React.TouchEvent) {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start || event.changedTouches.length === 0) return;
    const dx = event.changedTouches[0].clientX - start.x;
    const dy = event.changedTouches[0].clientY - start.y;
    // Deliberately require a clear horizontal gesture so ordinary scrolling
    // and taps on cards never page the timeline by accident.
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.25) return;
    page(dx < 0 ? 1 : -1);
  }

  const span: TimelineSpan = view === 'month' ? 'month' : 'week';
  const day = useTimeline(date);
  // Both hooks are declared; only the one on screen is allowed to fetch. The
  // span is asked for by its first day, so paging within a week is one request.
  const range = useTimelineRange(spanAnchor(span, date), span, view !== 'day');

  const isLoading = view === 'day' ? day.isLoading : range.isLoading;
  const spend = view === 'day' ? day.data?.spend : range.data?.spend;
  const trips: TripRef[] =
    view === 'day' ? (day.data?.trip ? [day.data.trip] : []) : (range.data?.trips ?? []);

  // Spending counts as something logged here too: a day whose only entry is a
  // cash fare has a card on it, so it is not the empty state.
  const dayIsEmpty =
    day.data &&
    day.data.visits.length === 0 &&
    day.data.expenses.length === 0 &&
    day.data.unassigned_images.length === 0;
  const showingNow =
    view === 'day'
      ? date === today
      : view === 'week'
        ? startOfWeek(date) === startOfWeek(today)
        : date.slice(0, 7) === today.slice(0, 7);

  return (
    <div
      className="flex flex-1 flex-col space-y-4 touch-pan-y"
      onTouchStart={(event) => {
        const touch = event.touches[0];
        touchStart.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
      }}
      onTouchEnd={finishSwipe}
      onTouchCancel={() => { touchStart.current = null; }}
    >
      <header className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            aria-label={`Previous ${view}`}
            onClick={() => page(-1)}
            className="rounded-full p-2 text-ink-3 active:bg-surface-2"
          >
            <ChevronLeft className="size-5" />
          </button>
          {view === 'day' ? (
            <input
              type="date"
              value={date}
              onChange={(e) => e.target.value && go({ date: e.target.value })}
              className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink"
            />
          ) : (
            <p className="text-sm font-semibold text-ink">
              {range.data
                ? formatSpanLabel(range.data.span, range.data.start, range.data.end)
                : '…'}
            </p>
          )}
          <button
            type="button"
            aria-label={`Next ${view}`}
            onClick={() => page(1)}
            className="rounded-full p-2 text-ink-3 active:bg-surface-2"
          >
            <ChevronRight className="size-5" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div
            role="tablist"
            aria-label="Timeline range"
            className="flex flex-1 rounded-xl bg-surface-2 p-0.5"
          >
            {VIEWS.map((option) => (
              <button
                key={option.id}
                type="button"
                role="tab"
                aria-selected={view === option.id}
                onClick={() => go({ view: option.id })}
                className={`flex-1 rounded-[10px] py-1.5 text-sm font-medium transition-colors ${
                  view === option.id
                    ? 'bg-surface text-ink shadow-sm'
                    : 'text-ink-3 active:text-ink'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          {!showingNow && (
            <button
              type="button"
              onClick={() => go({ date: today })}
              className="shrink-0 rounded-xl border border-line px-3 py-1.5 text-sm font-medium text-brand-600 active:bg-surface-2"
            >
              Today
            </button>
          )}
        </div>
      </header>

      <div
        key={`${view}:${date}`}
        className={`space-y-4 ${pageDirection === 1 ? 'timeline-page-forward' : 'timeline-page-back'}`}
      >
        {trips.map((trip) => (
          <Link
            key={trip.id}
            to={`/trips/${trip.id}`}
            className="flex items-center gap-2 rounded-xl bg-brand-50 px-4 py-2.5 text-sm text-brand-700"
          >
            <Luggage className="size-4 shrink-0" />
            <span className="flex-1 truncate">
              {view === 'day' ? 'Part of ' : 'Includes '}
              <span className="font-semibold">{trip.title}</span>
              {isOpenTrip(trip) && ' · ongoing'}
            </span>
            <ChevronRight className="size-4 shrink-0 text-brand-500" />
          </Link>
        ))}

        {spend && spend.base_total_minor > 0 && (
          <p className="rounded-xl bg-money-bg px-4 py-2.5 text-sm text-money">
            Spent this {view}: <span className="font-semibold">{formatSpend(spend)}</span>
          </p>
        )}

        {isLoading && <p className="py-12 text-center text-sm text-ink-4">Loading {view}…</p>}

        {view === 'day' && dayIsEmpty && (
          <div className="py-16 text-center">
            <p className="text-ink-3">Nothing logged this day.</p>
            <Link to="/upload" className="mt-2 inline-block font-medium text-brand-600">
              Upload photos →
            </Link>
          </div>
        )}

        {view === 'day' && day.data && (
          <DayRail visits={day.data.visits} expenses={day.data.expenses} />
        )}

        {view === 'day' && day.data && day.data.unassigned_images.length > 0 && (
          <section className="space-y-2">
            <h2 className="px-1 text-sm font-semibold text-ink-3">Not yet placed</h2>
            <div className="flex flex-wrap gap-2">
              {day.data.unassigned_images.map((image) => (
                <ImageThumb key={image.id} image={image} onClick={() => setOpenImage(image)} />
              ))}
            </div>
          </section>
        )}

        {view === 'week' && range.data && (
          <WeekView
            data={range.data}
            today={today}
            onOpenDay={(d) => go({ view: 'day', date: d })}
          />
        )}

        {view === 'month' && range.data && (
          <MonthView
            data={range.data}
            today={today}
            onOpenDay={(d) => go({ view: 'day', date: d })}
          />
        )}

        {view !== 'day' && range.data && isSpanEmpty(range.data) && (
          <p className="pb-4 text-center text-sm text-ink-4">
            Nothing logged this {view}.{' '}
            <Link to="/upload" className="font-medium text-brand-600">
              Upload photos →
            </Link>
          </p>
        )}
      </div>

      {openImage && <ImageModal image={openImage} onClose={() => setOpenImage(null)} />}
    </div>
  );
}
