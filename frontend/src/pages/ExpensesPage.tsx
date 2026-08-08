import { AlertTriangle, MapPin, Pencil, Plus, Receipt, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { ExpenseSheet } from '../components/ExpenseSheet';
import { ConfirmRateSheet } from '../components/ConfirmRateSheet';
import { ImageModal } from '../components/ImageModal';
import { useAuth } from '../context/AuthContext';
import { useDeleteExpense, useExpenseSummary, useExpenses, useImage } from '../hooks/useData';
import { formatMoney } from '../lib/format';
import type { Expense, MerchantTotal } from '../types';

/** Single-hue magnitude bars: one series, values in ink rather than series color. */
function MerchantBars({ merchants }: { merchants: MerchantTotal[] }) {
  const max = Math.max(...merchants.map((m) => m.base_total_minor), 1);
  return (
    <div className="space-y-2">
      {merchants.map((m) => (
        <div key={m.merchant} title={`${m.count} expense${m.count === 1 ? '' : 's'}`}>
          <div className="mb-0.5 flex items-baseline justify-between gap-2 text-sm">
            <span className="truncate text-slate-700">{m.merchant}</span>
            <span className="shrink-0 font-medium text-slate-900 tabular-nums">
              {formatMoney(m.base_total_minor, m.base_currency)}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
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
    <li className="rounded-2xl border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-3 p-3 text-left"
      >
        <span
          className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${
            expense.source === 'receipt'
              ? 'bg-amber-50 text-amber-600'
              : 'bg-slate-100 text-slate-500'
          }`}
        >
          {expense.source === 'receipt' ? (
            <Receipt className="size-4" />
          ) : (
            <Pencil className="size-4" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-slate-900">
            {expense.description ?? whereLabel ?? 'Expense'}
          </span>
          <span className="flex items-center gap-1 text-xs text-slate-500">
            {expense.description && whereLabel && (
              <>
                <MapPin className="size-3 shrink-0 text-slate-400" />
                <span className="max-w-32 truncate">{whereLabel}</span>
                <span className="text-slate-300">·</span>
              </>
            )}
            <span className="truncate">
              {expense.spent_at ? new Date(expense.spent_at).toLocaleString() : 'date unknown'}
            </span>
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-sm font-semibold text-slate-900 tabular-nums">
            {expense.base_total_minor != null
              ? formatMoney(expense.base_total_minor, expense.base_currency)
              : '—'}
          </span>
          {isForeign && (
            <span className="block text-xs text-slate-400 tabular-nums">
              {formatMoney(expense.total_minor, expense.currency)}
            </span>
          )}
        </span>
      </button>

      {expense.needs_review && (
        <button
          type="button"
          onClick={onConfirm}
          className="flex w-full items-center gap-2 border-t border-amber-100 bg-amber-50 px-3 py-2 text-left text-xs font-medium text-amber-800"
        >
          <AlertTriangle className="size-3.5 shrink-0" />
          Paid in {expense.currency} — confirm the conversion rate
        </button>
      )}

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
          {isForeign && expense.fx_rate != null && (
            <p className="mt-1 text-xs text-slate-400">
              1 {expense.currency} = {expense.fx_rate} {expense.base_currency}
              {expense.fx_rate_source === 'manual' ? ' (your rate)' : " (today's rate)"}
            </p>
          )}
          {expense.tax_minor != null && (
            <p className="mt-1 text-xs text-slate-400">
              incl. tax {formatMoney(expense.tax_minor, expense.currency)}
            </p>
          )}
          {expense.place?.formatted_address && (
            <p className="mt-1 flex items-center gap-1 text-xs text-slate-400">
              <MapPin className="size-3 shrink-0" />
              {expense.place.formatted_address}
            </p>
          )}
          {expense.note && <p className="mt-1 text-xs text-slate-500">{expense.note}</p>}
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
              className="flex items-center gap-1 text-xs font-medium text-rose-600"
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

export function ExpensesPage() {
  const { user } = useAuth();
  const baseCurrency = user?.preferred_currency ?? 'THB';
  const { data: summary } = useExpenseSummary();
  const { data: expenses, isLoading } = useExpenses();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [confirming, setConfirming] = useState<Expense | null>(null);

  const needsReview = expenses?.filter((e) => e.needs_review) ?? [];

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-slate-900">Expenses</h1>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white active:bg-brand-700"
        >
          <Plus className="size-4" /> Add
        </button>
      </header>

      {needsReview.length > 0 && (
        <button
          type="button"
          onClick={() => setConfirming(needsReview[0])}
          className="flex w-full items-center gap-2 rounded-xl bg-amber-50 px-4 py-3 text-left text-sm text-amber-900"
        >
          <AlertTriangle className="size-4 shrink-0 text-amber-600" />
          <span className="flex-1">
            {needsReview.length} foreign-currency expense{needsReview.length === 1 ? '' : 's'} need
            {needsReview.length === 1 ? 's' : ''} a confirmed rate
          </span>
          <span className="shrink-0 font-semibold text-amber-700">Review →</span>
        </button>
      )}

      {summary && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Total spent</p>
          <p className="mt-0.5 text-3xl font-bold text-slate-900 tabular-nums">
            {formatMoney(summary.spend.base_total_minor, summary.spend.base_currency)}
          </p>
          {summary.spend.by_currency.length > 1 && (
            <p className="mt-1 text-xs text-slate-500">
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
          <h2 className="text-sm font-semibold text-slate-500">Top merchants</h2>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <MerchantBars merchants={summary.by_merchant.slice(0, 8)} />
          </div>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-500">All expenses</h2>
        {isLoading && <p className="py-8 text-center text-sm text-slate-400">Loading…</p>}
        {expenses?.length === 0 && (
          <p className="py-12 text-center text-sm text-slate-500">
            Nothing yet — upload a receipt photo, or add an expense by hand.
          </p>
        )}
        <ul className="space-y-2">
          {expenses?.map((expense) => (
            <ExpenseRow
              key={expense.id}
              expense={expense}
              onConfirm={() => setConfirming(expense)}
              onEdit={() => setEditing(expense)}
            />
          ))}
        </ul>
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
    </div>
  );
}
