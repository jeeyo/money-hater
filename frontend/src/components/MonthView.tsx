import { formatMoneyCompact, parseLocalDate } from '../lib/format';
import type { TimelineDaySummary, TimelineRange } from '../types';

// 1 Jan 2024 was a Monday, which is where the grid — and the server's weeks —
// start. Naming the weekdays off it keeps them in the reader's own language.
const WEEKDAYS = Array.from({ length: 7 }, (_, i) =>
  new Date(2024, 0, 1 + i).toLocaleDateString(undefined, { weekday: 'narrow' }),
);

function DayCell({
  day,
  isToday,
  onOpen,
}: {
  day: TimelineDaySummary;
  isToday: boolean;
  onOpen: () => void;
}) {
  const cover = day.thumbs.find((image) => image.thumb_url);
  const spent = day.spend.base_total_minor > 0;
  const label = [
    parseLocalDate(day.date).toLocaleDateString(undefined, { dateStyle: 'full' }),
    day.stops.length > 0 ? day.stops.join(', ') : null,
    spent ? formatMoneyCompact(day.spend.base_total_minor, day.spend.base_currency) : null,
  ]
    .filter(Boolean)
    .join(' — ');

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={label}
      className={`relative aspect-square overflow-hidden rounded-xl border ${
        isToday ? 'border-brand-500 ring-1 ring-brand-500' : cover ? 'border-line' : 'border-line-soft'
      } ${cover ? '' : 'bg-surface'}`}
    >
      {cover && (
        <>
          <img src={cover.thumb_url!} alt="" loading="lazy" className="size-full object-cover" />
          {/* The day number and the spend both sit on the photo, so they get
              their own ground rather than trusting whatever it happens to be. */}
          <span className="absolute inset-0 bg-linear-to-b from-black/45 via-transparent to-black/60" />
        </>
      )}

      <span
        className={`absolute left-1.5 top-1 text-xs font-semibold ${
          cover ? 'text-white' : isToday ? 'text-brand-600' : 'text-ink-2'
        }`}
      >
        {parseLocalDate(day.date).getDate()}
      </span>

      {cover && day.image_count > 1 && (
        <span className="absolute right-1.5 top-1.5 text-[10px] font-semibold text-white/90">
          +{day.image_count - 1}
        </span>
      )}

      {/* A stop with no photograph would otherwise leave the day looking empty */}
      {!cover && day.visit_count > 0 && (
        <span className="absolute left-1/2 top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-500" />
      )}

      {spent && (
        <span
          className={`absolute inset-x-0.5 bottom-1 truncate text-center text-[10px] font-semibold ${
            cover ? 'text-white' : 'text-money'
          }`}
        >
          {formatMoneyCompact(day.spend.base_total_minor, day.spend.base_currency)}
        </span>
      )}
    </button>
  );
}

export function MonthView({
  data,
  today,
  onOpenDay,
}: {
  data: TimelineRange;
  today: string;
  onOpenDay: (date: string) => void;
}) {
  // The month starts mid-week, so the grid needs blanks before the 1st to keep
  // every column under its own weekday.
  const lead = (parseLocalDate(data.start).getDay() + 6) % 7;

  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-7 gap-1.5">
        {WEEKDAYS.map((name, index) => (
          <span
            key={`${name}-${index}`}
            aria-hidden
            className="text-center text-[11px] font-medium text-ink-4"
          >
            {name}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: lead }, (_, i) => (
          <span key={`lead-${i}`} />
        ))}
        {data.days.map((day) => (
          <DayCell
            key={day.date}
            day={day}
            isToday={day.date === today}
            onOpen={() => onOpenDay(day.date)}
          />
        ))}
      </div>
    </div>
  );
}
