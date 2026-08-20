import { X } from 'lucide-react';
import { useExpenseSummary } from '../hooks/useData';
import { formatMoney, localDateString, shiftDate, startOfWeek } from '../lib/format';

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

function SummaryRow({
  label,
  from,
  to,
  baseCurrency,
}: {
  label: string;
  from: string;
  to: string;
  baseCurrency: string;
}) {
  const { data, isLoading } = useExpenseSummary(from, to);
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl border border-line bg-surface px-4 py-3">
      <span className="text-sm font-medium text-ink-2">{label}</span>
      <span className="text-lg font-bold text-ink tabular-nums">
        {isLoading || !data
          ? '—'
          : formatMoney(data.spend.base_total_minor, data.spend.base_currency || baseCurrency)}
      </span>
    </div>
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
        <div className="space-y-2">
          {(Object.keys(RANGE_LABELS) as RangeKey[]).map((key) => (
            <SummaryRow
              key={key}
              label={RANGE_LABELS[key]}
              from={ranges[key].from}
              to={ranges[key].to}
              baseCurrency={baseCurrency}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
