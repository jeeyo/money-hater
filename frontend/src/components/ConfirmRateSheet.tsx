import { useState } from 'react';
import { useConfirmExpense } from '../hooks/useData';
import { formatMoney, toMajor, toMinor } from '../lib/format';
import { Sheet, inputClass, labelClass } from './Sheet';
import type { Expense } from '../types';

/** Asks the user to sign off on the conversion for a foreign-currency expense. */
export function ConfirmRateSheet({
  expense,
  onClose,
}: {
  expense: Expense;
  onClose: () => void;
}) {
  const confirm = useConfirmExpense();
  const [rate, setRate] = useState<string>(expense.fx_rate?.toString() ?? '');

  const numericRate = Number(rate) || 0;
  const amountMajor = toMajor(expense.total_minor, expense.currency);
  const converted =
    numericRate > 0 ? toMinor(amountMajor * numericRate, expense.base_currency) : null;
  const changed = expense.fx_rate == null || numericRate !== expense.fx_rate;

  return (
    <Sheet title="Confirm conversion" onClose={onClose}>
      <div className="space-y-4">
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-sm text-slate-500">{expense.merchant ?? 'Expense'}</p>
          <p className="text-2xl font-bold text-slate-900">
            {formatMoney(expense.total_minor, expense.currency)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Paid in {expense.currency}
            {expense.spent_at && <> · {new Date(expense.spent_at).toLocaleString()}</>}
          </p>
        </div>

        <label className="block space-y-1">
          <span className={labelClass}>
            Rate — 1 {expense.currency} in {expense.base_currency}
          </span>
          <input
            autoFocus
            type="number"
            step="any"
            inputMode="decimal"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            placeholder="e.g. 0.235"
            className={inputClass}
          />
          <span className="text-xs text-slate-400">
            {expense.fx_rate_source === 'api'
              ? "Prefilled with today's reference rate — edit it if your card charged another."
              : 'No rate was available; enter the one you got.'}
          </span>
        </label>

        <div className="rounded-xl bg-brand-50 p-3">
          <p className="text-xs text-brand-700">Recorded as</p>
          <p className="text-xl font-bold text-brand-700">
            {converted != null ? formatMoney(converted, expense.base_currency) : '—'}
          </p>
        </div>

        {confirm.isError && <p className="text-sm text-rose-600">{confirm.error.message}</p>}

        <button
          type="button"
          disabled={confirm.isPending || numericRate <= 0}
          onClick={() =>
            confirm.mutate(
              { id: expense.id, fx_rate: changed ? numericRate : undefined },
              { onSuccess: onClose },
            )
          }
          className="w-full rounded-xl bg-brand-600 py-3 text-base font-semibold text-white active:bg-brand-700 disabled:opacity-50"
        >
          {confirm.isPending ? 'Saving…' : 'Confirm'}
        </button>
      </div>
    </Sheet>
  );
}
