import {
  AlertTriangle,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Pencil,
  Plus,
  Receipt,
  Trash2,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { ExpenseSheet } from '../components/ExpenseSheet';
import { ConfirmRateSheet } from '../components/ConfirmRateSheet';
import { ExpenseSummaryModal } from '../components/ExpenseSummaryModal';
import { ImageModal } from '../components/ImageModal';
import { useAuth } from '../context/AuthContext';
import {
  useDeleteExpense,
  useExpenseSummary,
  useExpenses,
  useExpensesGrouped,
  useImage,
} from '../hooks/useData';
import { formatDateTime, formatMoney } from '../lib/format';
import type { Expense, ExpenseGroup, MerchantTotal } from '../types';

/** Single-hue magnitude bars: one series, values in ink rather than series color. */
function MerchantBars({ merchants }: { merchants: MerchantTotal[] }) {
  const max = Math.max(...merchants.map((m) => m.base_total_minor), 1);
  return (
    <div className="space-y-2">
      {merchants.map((m) => (
        <div key={m.merchant} title={`${m.count} expense${m.count === 1 ? '' : 's'}`}>
          <div className="mb-0.5 flex items-baseline justify-between gap-2 text-sm">
            <span className="truncate text-ink-2">{m.merchant}</span>
            <span className="shrink-0 font-medium text-ink tabular-nums">
              {formatMoney(m.base_total_minor, m.base_currency)}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-brand-500"
              style={{ width: `${Math.max((m.base_total_minor / max) * 100, 2)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function ExpenseRow({
  expense,
  onConfirm,
  onEdit,
}: {
  expense: Expense;
  onConfirm: () => void;
  onEdit: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const { data: image } = useImage(showReceipt ? expense.image_id : null);
  const remove = useDeleteExpense();

  const isForeign = expense.currency !== expense.base_currency;
  const whereLabel = expense.place?.name ?? expense.merchant;

  return (
    <li className="rounded-2xl border border-line bg-surface">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-3 p-3 text-left"
      >
        <span
          className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${
            expense.source === 'receipt'
              ? 'bg-money-bg text-money'
              : 'bg-surface-2 text-ink-3'
          }`}
        >
          {expense.source === 'receipt' ? (
            <Receipt className="size-4" />
          ) : (
            <Pencil className="size-4" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-ink">
            {expense.description ?? whereLabel ?? 'Expense'}
          </span>
          <span className="flex items-center gap-1 text-xs text-ink-3">
            {expense.description && whereLabel && (
              <>
                <MapPin className="size-3 shrink-0 text-ink-4" />
                <span className="max-w-32 truncate">{whereLabel}</span>
                <span className="text-ink-4">·</span>
              </>
            )}
            <span className="truncate">
              {expense.spent_at ? formatDateTime(expense.spent_at) : 'date unknown'}
            </span>
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-sm font-semibold text-ink tabular-nums">
            {expense.base_total_minor != null
              ? formatMoney(expense.base_total_minor, expense.base_currency)
              : '—'}
          </span>
          {isForeign && (
            <span className="block text-xs text-ink-4 tabular-nums">
              {formatMoney(expense.total_minor, expense.currency)}
            </span>
          )}
        </span>
      </button>

      {expense.needs_review && (
        <button
          type="button"
          onClick={onConfirm}
          className="flex w-full items-center gap-2 border-t border-line-soft bg-money-bg px-3 py-2 text-left text-xs font-medium text-money"
        >
          <AlertTriangle className="size-3.5 shrink-0" />
          Paid in {expense.currency} — confirm the conversion rate
        </button>
      )}

      {expanded && (
        <div className="border-t border-line-soft px-3 py-2">
          {expense.items.length > 0 && (
            <ul className="space-y-1 text-sm">
              {expense.items.map((item) => (
                <li key={item.id} className="flex justify-between gap-2">
                  <span className="truncate text-ink-2">
                    {item.qty !== 1 && <span className="text-ink-4">{item.qty}× </span>}
                    {item.name}
                  </span>
                  <span className="shrink-0 text-ink-2 tabular-nums">
                    {formatMoney(item.amount_minor, expense.currency)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {isForeign && expense.fx_rate != null && (
            <p className="mt-1 text-xs text-ink-4">
              1 {expense.currency} = {expense.fx_rate} {expense.base_currency}
              {expense.fx_rate_source === 'manual' ? ' (your rate)' : " (today's rate)"}
            </p>
          )}
          {expense.tax_minor != null && (
            <p className="mt-1 text-xs text-ink-4">
              incl. tax {formatMoney(expense.tax_minor, expense.currency)}
            </p>
          )}
          {expense.place?.formatted_address && (
            <p className="mt-1 flex items-center gap-1 text-xs text-ink-4">
              <MapPin className="size-3 shrink-0" />
              {expense.place.formatted_address}
            </p>
          )}
          {expense.note && <p className="mt-1 text-xs text-ink-3">{expense.note}</p>}
          <div className="mt-2 flex items-center gap-4">
            <button
              type="button"
              onClick={onEdit}
              className="flex items-center gap-1 text-xs font-medium text-brand-600"
            >
              <Pencil className="size-3.5" /> Edit
            </button>
            {expense.image_id != null && (
              <button
                type="button"
                onClick={() => setShowReceipt(true)}
                className="text-xs font-medium text-brand-600"
              >
                Receipt photo →
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                if (confirm('Delete this expense?')) remove.mutate(expense.id);
              }}
              className="flex items-center gap-1 text-xs font-medium text-danger"
            >
              <Trash2 className="size-3.5" /> Delete
            </button>
          </div>
        </div>
      )}
      {showReceipt && image && <ImageModal image={image} onClose={() => setShowReceipt(false)} />}
    </li>
  );
}

/** One section of the All expenses list — expenses sharing a resolved place
 *  or, absent that, matching merchant text, under a header; otherwise a
 *  single ungrouped expense standing on its own. */
function ExpenseGroupSection({
  group,
  baseCurrency,
  onConfirm,
  onEdit,
}: {
  group: ExpenseGroup;
  baseCurrency: string;
  onConfirm: (expense: Expense) => void;
  onEdit: (expense: Expense) => void;
}) {
  const label = group.place?.name ?? group.merchant;
  // A shared place always gets a header, even for one visit; shared merchant
  // text only earns one once it has actually merged something — otherwise
  // every plain manual expense would grow a header that just repeats its own
  // row.
  const showHeader = group.place != null || (label != null && group.expenses.length > 1);

  if (!showHeader) {
    return (
      <>
        {group.expenses.map((expense) => (
          <ExpenseRow
            key={expense.id}
            expense={expense}
            onConfirm={() => onConfirm(expense)}
            onEdit={() => onEdit(expense)}
          />
        ))}
      </>
    );
  }

  const total = group.expenses.reduce((sum, e) => sum + (e.base_total_minor ?? 0), 0);

  return (
    <li className="space-y-2">
      <div className="flex items-center justify-between gap-2 px-1">
        <span className="flex min-w-0 items-center gap-1 text-xs font-semibold text-ink-3">
          <MapPin className="size-3.5 shrink-0 text-ink-4" />
          <span className="truncate">{label}</span>
        </span>
        <span className="shrink-0 text-xs font-medium text-ink-4 tabular-nums">
          {formatMoney(total, baseCurrency)} · {group.expenses.length}
        </span>
      </div>
      <ul className="space-y-2">
        {group.expenses.map((expense) => (
          <ExpenseRow
            key={expense.id}
            expense={expense}
            onConfirm={() => onConfirm(expense)}
            onEdit={() => onEdit(expense)}
          />
        ))}
      </ul>
    </li>
  );
}

export function ExpensesPage() {
  const { user } = useAuth();
  const baseCurrency = user?.preferred_currency ?? 'THB';
  const { data: summary } = useExpenseSummary();
  const { data: needsReview } = useExpenses(true);
  const [page, setPage] = useState(1);
  const { data: expensePage, isLoading, isFetching } = useExpensesGrouped(page);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [confirming, setConfirming] = useState<Expense | null>(null);
  const [showSummary, setShowSummary] = useState(false);

  const totalPages = expensePage?.total_pages ?? 1;
  // Deleting the last expense on the last page would otherwise strand the
  // view on a page that no longer exists.
  useEffect(() => {
    if (expensePage && page > expensePage.total_pages) setPage(expensePage.total_pages);
  }, [expensePage, page]);

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-ink">Expenses</h1>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white active:bg-brand-700"
        >
          <Plus className="size-4" /> Add
        </button>
      </header>

      {needsReview && needsReview.length > 0 && (
        <button
          type="button"
          onClick={() => setConfirming(needsReview[0])}
          className="flex w-full items-center gap-2 rounded-xl bg-money-bg px-4 py-3 text-left text-sm text-money"
        >
          <AlertTriangle className="size-4 shrink-0 text-money" />
          <span className="flex-1">
            {needsReview.length} foreign-currency expense{needsReview.length === 1 ? '' : 's'} need
            {needsReview.length === 1 ? 's' : ''} a confirmed rate
          </span>
          <span className="shrink-0 font-semibold text-money">Review →</span>
        </button>
      )}

      {summary && (
        <div className="rounded-2xl border border-line bg-surface p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs text-ink-3">Total spent</p>
              <p className="mt-0.5 text-3xl font-bold text-ink tabular-nums">
                {formatMoney(summary.spend.base_total_minor, summary.spend.base_currency)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowSummary(true)}
              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-ink-2 active:bg-surface-2"
            >
              <BarChart3 className="size-3.5" /> Summary
            </button>
          </div>
          {summary.spend.by_currency.length > 1 && (
            <p className="mt-1 text-xs text-ink-3">
              Paid in{' '}
              {summary.spend.by_currency
                .map((c) => formatMoney(c.total_minor, c.currency))
                .join(' · ')}
            </p>
          )}
        </div>
      )}

      {summary && summary.by_merchant.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-ink-3">Top merchants</h2>
          <div className="rounded-2xl border border-line bg-surface p-4">
            <MerchantBars merchants={summary.by_merchant.slice(0, 8)} />
          </div>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-ink-3">All expenses</h2>
        {isLoading && <p className="py-8 text-center text-sm text-ink-4">Loading…</p>}
        {expensePage?.groups.length === 0 && (
          <p className="py-12 text-center text-sm text-ink-3">
            Nothing yet — upload a receipt photo, or add an expense by hand.
          </p>
        )}
        <ul className={`space-y-2 ${isFetching ? 'opacity-60' : ''}`}>
          {expensePage?.groups.map((group) => (
            <ExpenseGroupSection
              key={group.place ? `place:${group.place.id}` : `expense:${group.expenses[0].id}`}
              group={group}
              baseCurrency={baseCurrency}
              onConfirm={setConfirming}
              onEdit={setEditing}
            />
          ))}
        </ul>
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-4 pt-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="flex size-8 items-center justify-center rounded-full border border-line text-ink-3 disabled:opacity-30"
            >
              <ChevronLeft className="size-4" />
            </button>
            <span className="text-sm text-ink-3 tabular-nums">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="flex size-8 items-center justify-center rounded-full border border-line text-ink-3 disabled:opacity-30"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        )}
      </section>

      {adding && <ExpenseSheet baseCurrency={baseCurrency} onClose={() => setAdding(false)} />}
      {editing && (
        <ExpenseSheet
          baseCurrency={baseCurrency}
          expense={editing}
          onClose={() => setEditing(null)}
        />
      )}
      {confirming && (
        <ConfirmRateSheet expense={confirming} onClose={() => setConfirming(null)} />
      )}
      {showSummary && (
        <ExpenseSummaryModal baseCurrency={baseCurrency} onClose={() => setShowSummary(false)} />
      )}
    </div>
  );
}
