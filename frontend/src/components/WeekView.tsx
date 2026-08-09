import { ChevronRight, Images, MapPin } from 'lucide-react';
import { formatSpend, parseLocalDate } from '../lib/format';
import type { TimelineDaySummary, TimelineRange } from '../types';

/** "Wat Pho · Menya Itto · +2 more" — a day's shape in one line. */
const NAMED_STOPS = 2;

function stopLine(day: TimelineDaySummary): string {
  const shown = day.stops.slice(0, NAMED_STOPS).join(' · ');
  const rest = day.stops.length - NAMED_STOPS;
  return rest > 0 ? `${shown} · +${rest} more` : shown;
}

function DayRow({
  day,
  isToday,
  onOpen,
}: {
  day: TimelineDaySummary;
  isToday: boolean;
  onOpen: () => void;
}) {
  const date = parseLocalDate(day.date);
  const spent = day.spend.base_total_minor > 0;
  const empty = day.visit_count === 0 && day.image_count === 0 && !spent;

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`flex w-full items-center gap-3 rounded-2xl border bg-surface p-3 text-left active:bg-surface-2 ${
        isToday ? 'border-brand-500' : empty ? 'border-line-soft' : 'border-line'
      }`}
    >
      <div className="w-9 shrink-0 text-center">
        <p className={`text-[11px] uppercase ${isToday ? 'text-brand-600' : 'text-ink-4'}`}>
          {date.toLocaleDateString(undefined, { weekday: 'short' })}
        </p>
        <p className={`text-lg font-semibold ${isToday ? 'text-brand-600' : 'text-ink'}`}>
          {date.getDate()}
        </p>
      </div>

      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <p className={`truncate text-sm ${empty ? 'text-ink-4' : 'font-medium text-ink'}`}>
            {day.stops.length > 0
              ? stopLine(day)
              : day.image_count > 0
                ? 'Photos, no stop yet'
                : spent
                  ? 'Spending, no stops'
                  : 'Nothing logged'}
          </p>
          {spent && (
            <span className="shrink-0 rounded-full bg-money-bg px-2 py-0.5 text-xs font-semibold text-money">
              {formatSpend(day.spend)}
            </span>
          )}
        </div>

        {day.thumbs.length > 0 && (
          <div className="flex gap-1.5">
            {day.thumbs.map((image) => (
              <span
                key={image.id}
                className="size-11 shrink-0 overflow-hidden rounded-lg bg-surface-2"
              >
                {image.thumb_url && (
                  <img
                    src={image.thumb_url}
                    alt=""
                    loading="lazy"
                    className="size-full object-cover"
                  />
                )}
              </span>
            ))}
          </div>
        )}

        {day.visit_count + day.image_count > 0 && (
          <p className="flex items-center gap-3 text-xs text-ink-4">
            {day.visit_count > 0 && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3" />
                {day.visit_count} stop{day.visit_count === 1 ? '' : 's'}
              </span>
            )}
            {day.image_count > 0 && (
              <span className="inline-flex items-center gap-1">
                <Images className="size-3" />
                {day.image_count}
              </span>
            )}
          </p>
        )}
      </div>

      <ChevronRight className="size-4 shrink-0 text-ink-4" />
    </button>
  );
}

export function WeekView({
  data,
  today,
  onOpenDay,
}: {
  data: TimelineRange;
  today: string;
  onOpenDay: (date: string) => void;
}) {
  return (
    <div className="space-y-2">
      {data.days.map((day) => (
        <DayRow
          key={day.date}
          day={day}
          isToday={day.date === today}
          onOpen={() => onOpenDay(day.date)}
        />
      ))}
    </div>
  );
}
