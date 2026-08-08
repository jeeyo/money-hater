import { Receipt } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ImageModal } from '../components/ImageModal';
import { useExpenses, useExpenseSummary, useImage } from '../hooks/useData';
import { formatMoney } from '../lib/format';
import type { Expense } from '../types';

/** Single-hue magnitude bars (one series, so no legend; values in ink, not series color). */
function MerchantBars({
  merchants,
}: {
  merchants: { merchant: string; currency: string; total_minor: number; count: number }[];
}) {
  const max = Math.max(...merchants.map((m) => m.total_minor), 1);
  return (
    <div className="space-y-2">
      {merchants.map((m) => (
        <div key={`${m.merchant}-${m.currency}`} title={`${m.count} receipt${m.count === 1 ? '' : 's'}`}>
          <div className="mb-0.5 flex items-baseline justify-between gap-2 text-sm">
            <span className="truncate text-slate-700">{m.merchant}</span>
            <span className="shrink-0 font-medium text-slate-900 tabular-nums">
              {formatMoney(m.total_minor, m.currency)}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-brand-500"
              style={{ width: `${Math.max((m.total_minor / max) * 100, 2)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function ExpenseRow({ expense }: { expense: Expense }) {
  const [expanded, setExpanded] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const { data: image } = useImage(showReceipt ? expense.image_id : null);

  return (
    <li className="rounded-2xl border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-3 p-3 text-left"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
          <Receipt className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-slate-900">
            {expense.merchant ?? 'Unknown merchant'}
          </span>
          <span className="block text-xs text-slate-500">
            {expense.spent_at ? new Date(expense.spent_at).toLocaleString() : 'date unknown'}
          </span>
        </span>
        <span className="shrink-0 text-sm font-semibold text-slate-900 tabular-nums">
          {formatMoney(expense.total_minor, expense.currency)}
        </span>
      </button>
      {expanded && (
        <div className="border-t border-slate-100 px-3 py-2">
          {expense.items.length > 0 && (
            <ul className="space-y-1 text-sm">
              {expense.items.map((item) => (
                <li key={item.id} className="flex justify-between gap-2">
                  <span className="truncate text-slate-600">
                    {item.qty !== 1 && <span className="text-slate-400">{item.qty}× </span>}
                    {item.name}
                  </span>
                  <span className="shrink-0 text-slate-700 tabular-nums">
                    {formatMoney(item.amount_minor, expense.currency)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {expense.tax_minor != null && (
            <p className="mt-1 text-xs text-slate-400">
              incl. tax {formatMoney(expense.tax_minor, expense.currency)}
            </p>
          )}
          <button
            type="button"
            onClick={() => setShowReceipt(true)}
            className="mt-2 text-xs font-medium text-brand-600"
          >
            View receipt photo →
          </button>
        </div>
      )}
      {showReceipt && image && <ImageModal image={image} onClose={() => setShowReceipt(false)} />}
    </li>
  );
}

export function ExpensesPage() {
  const { data: summary } = useExpenseSummary();
  const { data: expenses, isLoading } = useExpenses();

  const merchantsByCurrency = useMemo(() => {
    const groups = new Map<string, NonNullable<typeof summary>['by_merchant']>();
    for (const m of summary?.by_merchant ?? []) {
      const list = groups.get(m.currency) ?? [];
      list.push(m);
      groups.set(m.currency, list);
    }
    return groups;
  }, [summary]);

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-bold text-slate-900">Expenses</h1>

      {summary && summary.totals.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {summary.totals.map((total) => (
            <div
              key={total.currency}
              className="rounded-2xl border border-slate-200 bg-white p-3"
            >
              <p className="text-xs text-slate-500">Total {total.currency}</p>
              <p className="mt-0.5 truncate text-xl font-bold text-slate-900 tabular-nums">
                {formatMoney(total.total_minor, total.currency)}
              </p>
            </div>
          ))}
        </div>
      )}

      {[...merchantsByCurrency.entries()].map(([currency, merchants]) => (
        <section key={currency} className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-500">
            Top merchants{merchantsByCurrency.size > 1 ? ` (${currency})` : ''}
          </h2>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <MerchantBars merchants={merchants.slice(0, 8)} />
          </div>
        </section>
      ))}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-500">All receipts</h2>
        {isLoading && <p className="py-8 text-center text-sm text-slate-400">Loading…</p>}
        {expenses?.length === 0 && (
          <p className="py-12 text-center text-sm text-slate-500">
            No expenses yet — upload a receipt photo and it'll be parsed automatically.
          </p>
        )}
        <ul className="space-y-2">
          {expenses?.map((expense) => <ExpenseRow key={expense.id} expense={expense} />)}
        </ul>
      </section>
    </div>
  );
}
