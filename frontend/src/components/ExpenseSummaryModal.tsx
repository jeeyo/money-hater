import { X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useExpenseSummary, useExpenses } from '../hooks/useData';
import {
  formatMoney,
  formatMoneyCompact,
  localDateString,
  shiftDate,
  startOfWeek,
  wallClockBound,
  wallClockDay,
} from '../lib/format';

type RangeKey = 'last7' | 'wtd' | 'last30' | 'mtd';

const RANGE_LABELS: Record<RangeKey, string> = {
  last7: 'Last 7 days',
  wtd: 'Week to date',
  last30: 'Last 30 days',
  mtd: 'Month to date',
};

function useRanges(): Record<RangeKey, { from: string; to: string }> {
  const today = localDateString(new Date());
  const to = wallClockBound(shiftDate(today, 1));
  return {
    last7: { from: wallClockBound(shiftDate(today, -6)), to },
    wtd: { from: wallClockBound(startOfWeek(today)), to },
    last30: { from: wallClockBound(shiftDate(today, -29)), to },
    mtd: { from: wallClockBound(`${today.slice(0, 7)}-01`), to },
  };
}

/** The headline figure — spend with no date bound at all, so it reads at a
 *  glance above the four scoped tiles below it. */
function TotalSpentCard() {
  const { data, isLoading } = useExpenseSummary();
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <p className="text-xs text-ink-3">Total spent</p>
      <p className="mt-0.5 text-3xl font-bold text-ink tabular-nums">
        {isLoading || !data ? '—' : formatMoney(data.spend.base_total_minor, data.spend.base_currency)}
      </p>
      {data && data.spend.by_currency.length > 1 && (
        <p className="mt-1 text-xs text-ink-3">
          Paid in{' '}
          {data.spend.by_currency.map((c) => formatMoney(c.total_minor, c.currency)).join(' · ')}
        </p>
      )}
    </div>
  );
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
/** "Aug 27", from a bare YYYY-MM-DD — parsed and read back in UTC so the
 *  calendar day never shifts under the viewer's own timezone. */
function formatDayShort(date: string): string {
  return new Date(date).toLocaleDateString(undefined, {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
  });
}

function DailySpendChart({ baseCurrency }: { baseCurrency: string }) {
  const today = localDateString(new Date());
  const from = wallClockBound(shiftDate(today, -(CHART_DAYS - 1)));
  const to = wallClockBound(shiftDate(today, 1));
  const { data: expenses, isLoading } = useExpenses(undefined, from, to);
  const [selected, setSelected] = useState<string | null>(null);

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
  const active = days.find((d) => d.date === selected) ?? days[days.length - 1];

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-ink-3">Daily spend — last 30 days</h3>
      <div className="rounded-xl border border-line bg-surface p-3">
        {isLoading ? (
          <p className="py-6 text-center text-xs text-ink-4">Loading…</p>
        ) : (
          <>
            <div className="mb-1.5 flex items-baseline justify-between">
              <p className="text-sm font-semibold text-ink tabular-nums">
                {formatMoney(active.total, baseCurrency)}
              </p>
              <p className="text-[10px] text-ink-4">
                {selected ? formatDayShort(active.date) : 'Today'}
              </p>
            </div>
            <div className="flex h-24 items-end gap-[2px]">
              {days.map(({ date, total }) => (
                <button
                  key={date}
                  type="button"
                  onClick={() => setSelected(date === selected ? null : date)}
                  title={`${date}: ${formatMoney(total, baseCurrency)}`}
                  aria-label={`${formatDayShort(date)}: ${formatMoney(total, baseCurrency)}`}
                  className={`min-w-0 flex-1 appearance-none rounded-t-[2px] border-0 p-0 ${
                    date === selected
                      ? 'bg-money'
                      : date === today
                        ? 'bg-brand-600'
                        : 'bg-brand-500'
                  }`}
                  style={{ height: `${Math.max((total / max) * 100, 3)}%` }}
                />
              ))}
            </div>
            <div className="mt-1.5 flex justify-between text-[10px] text-ink-4">
              <span>{formatDayShort(days[0].date)}</span>
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

        <div className="mb-4">
          <TotalSpentCard />
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
