import { AlertTriangle, MapPin, Pencil } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { formatMoney, formatTime } from '../lib/format';
import type { Expense } from '../types';
import { ConfirmRateSheet } from './ConfirmRateSheet';
import { ExpenseSheet } from './ExpenseSheet';

/**
 * A stop-less, photo-less expense as an entry of the timeline in its own right.
 *
 * Deliberately quieter than a VisitCard: a soft border and a money-coloured
 * rail dot rather than the brand one, so a day still reads as the places you
 * went to, with the cash you spent between them alongside rather than
 * competing. Tapping it opens the same editor as the expenses list — the money
 * is now where you are looking, so correcting it should not mean going to
 * another screen.
 */
export function ExpenseCard({ expense }: { expense: Expense }) {
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const where = expense.place?.name ?? expense.merchant;
  const title = expense.description ?? where ?? 'Expense';
  const isForeign = expense.currency !== expense.base_currency;
  // The description is the headline when there is one, so the place drops to
  // the second line beside the time rather than being said twice.
  const subtitle = expense.description && where ? where : expense.note;

  return (
    <div className="relative pl-6">
      {/* timeline rail */}
      <span className="absolute left-0 top-2 flex size-4 items-center justify-center">
        <span className="size-2 rounded-full bg-money ring-4 ring-money-bg" />
      </span>
      <div className="rounded-2xl border border-line-soft bg-surface">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="flex w-full items-center gap-2.5 p-3 text-left active:bg-surface-2"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-ink-3">
            <Pencil className="size-3.5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-ink">{title}</span>
            <span className="flex items-center gap-1 text-xs text-ink-3">
              {expense.spent_at && (
                <span className="shrink-0">{formatTime(expense.spent_at)}</span>
              )}
              {subtitle && (
                <>
                  {expense.spent_at && <span className="text-ink-4">·</span>}
                  {expense.description && where && (
                    <MapPin className="size-3 shrink-0 text-ink-4" />
                  )}
                  <span className="truncate">{subtitle}</span>
                </>
              )}
            </span>
          </span>
          <span className="shrink-0 text-right">
            <span className="block rounded-full bg-money-bg px-2.5 py-1 text-xs font-semibold text-money tabular-nums">
              {expense.base_total_minor != null
                ? formatMoney(expense.base_total_minor, expense.base_currency)
                : formatMoney(expense.total_minor, expense.currency)}
            </span>
            {isForeign && expense.base_total_minor != null && (
              <span className="mt-0.5 block text-[11px] text-ink-4 tabular-nums">
                {formatMoney(expense.total_minor, expense.currency)}
              </span>
            )}
          </span>
        </button>

        {expense.needs_review && (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="flex w-full items-center gap-1.5 border-t border-line-soft px-3 py-1.5 text-left text-xs font-medium text-money"
          >
            <AlertTriangle className="size-3.5 shrink-0" />
            Confirm the {expense.currency} rate
          </button>
        )}
      </div>

      {editing && (
        <ExpenseSheet
          baseCurrency={user?.preferred_currency ?? expense.base_currency}
          expense={expense}
          onClose={() => setEditing(false)}
        />
      )}
      {confirming && <ConfirmRateSheet expense={expense} onClose={() => setConfirming(false)} />}
    </div>
  );
}
