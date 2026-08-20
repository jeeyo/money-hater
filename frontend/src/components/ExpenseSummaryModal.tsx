import { X } from 'lucide-react';
import { useMemo } from 'react';
import { useExpenseSummary, useExpenses } from '../hooks/useData';
import {
  formatMoney,
  formatMoneyCompact,
  localDateString,
  shiftDate,
  startOfWeek,
  wallClockDay,
} from '../lib/format';

type RangeKey = 'last7' | 'wtd' | 'last30' | 'mtd';

const RANGE_LABELS: Record<RangeKey, string> = {
  last7: 'Last 7 days',
  wtd: 'Week to date',
  last30: 'Last 30 days',
  mtd: 'Month to date',
};

/** Wall-clock day bounds as the API expects them: a bare date reused as a
 *  midnight instant, same convention as `fromWallClockInput`. */
function dayBound(dateStr: string): string {
  return `${dateStr}T00:00:00Z`;
}

function useRanges(): Record<RangeKey, { from: string; to: string }> {
  const today = localDateString(new Date());
  const to = dayBound(shiftDate(today, 1));
  return {
    last7: { from: dayBound(shiftDate(today, -6)), to },
    wtd: { from: dayBound(startOfWeek(today)), to },
    last30: { from: dayBound(shiftDate(today, -29)), to },
    mtd: { from: dayBound(`${today.slice(0, 7)}-01`), to },
  };
}

/** One headline total — a stat tile, not a chart: each range answers a single
 *  "how much" question, so the number is the whole story. */
function SummaryTile({
  label,
  from,
  to,
}: {
  label: string;
  from: string;
  to: string;
}) {
  const { data, isLoading } = useExpenseSummary(from, to);
  return (
    <div className="rounded-xl border border-line bg-surface p-3">
      <p className="text-xs text-ink-3">{label}</p>
      <p className="mt-1 text-xl font-semibold text-ink">
        {isLoading || !data
          ? '—'
          : formatMoneyCompact(data.spend.base_total_minor, data.spend.base_currency)}
      </p>
    </div>
  );
}

const CHART_DAYS = 30;

/** Where the trend actually moved, day by day — a bar chart, not a tile: the
 *  point is the shape over time, which a single number can't carry. Single
 *  hue (magnitude, not identity), today picked out in the darker step. */
function DailySpendChart({ baseCurrency }: { baseCurrency: string }) {
  const today = localDateString(new Date());
  const from = dayBound(shiftDate(today, -(CHART_DAYS - 1)));
  const to = dayBound(shiftDate(today, 1));
  const { data: expenses, isLoading } = useExpenses(undefined, from, to);

  const days = useMemo(() => {
    const keys = Array.from({ length: CHART_DAYS }, (_, i) =>
      shiftDate(today, -(CHART_DAYS - 1 - i))
    );
    const totals = new Map(keys.map((k) => [k, 0]));
    for (const expense of expenses ?? []) {
      if (!expense.spent_at || expense.base_total_minor == null) continue;
      const day = wallClockDay(expense.spent_at);
      if (totals.has(day)) totals.set(day, (totals.get(day) ?? 0) + expense.base_total_minor);
    }
    return keys.map((date) => ({ date, total: totals.get(date) ?? 0 }));
  }, [expenses, today]);

  const max = Math.max(...days.map((d) => d.total), 1);

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-ink-3">Daily spend — last 30 days</h3>
      <div className="rounded-xl border border-line bg-surface p-3">
        {isLoading ? (
          <p className="py-6 text-center text-xs text-ink-4">Loading…</p>
        ) : (
          <>
            <div className="flex h-24 items-end gap-[2px]">
              {days.map(({ date, total }) => (
                <div
                  key={date}
                  title={`${date}: ${formatMoney(total, baseCurrency)}`}
                  className={`min-w-0 flex-1 rounded-t-[2px] ${
                    date === today ? 'bg-brand-600' : 'bg-brand-500'
                  }`}
                  style={{ height: `${Math.max((total / max) * 100, 3)}%` }}
                />
              ))}
            </div>
            <div className="mt-1.5 flex justify-between text-[10px] text-ink-4">
              <span>{days[0].date}</span>
              <span>Today</span>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

export function ExpenseSummaryModal({
  baseCurrency,
  onClose,
}: {
  baseCurrency: string;
  onClose: () => void;
}) {
  const ranges = useRanges();

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 dark:bg-black/85 md:items-center"
      onClick={onClose}
    >
      <div
        className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-surface p-4 ring-1 ring-line md:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold text-ink">Spending summary</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-ink-3 active:bg-surface-2"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(RANGE_LABELS) as RangeKey[]).map((key) => (
            <SummaryTile
              key={key}
              label={RANGE_LABELS[key]}
              from={ranges[key].from}
              to={ranges[key].to}
            />
          ))}
        </div>

        <div className="mt-4">
          <DailySpendChart baseCurrency={baseCurrency} />
        </div>
      </div>
    </div>
  );
}
