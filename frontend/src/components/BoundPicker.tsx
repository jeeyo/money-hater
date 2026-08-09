import { Check } from 'lucide-react';
import { formatMoney, localDateString } from '../lib/format';
import type { Expense } from '../types';
import { inputClass } from './Sheet';

export function expenseLabel(expense: Expense): string {
  return expense.description ?? expense.place?.name ?? expense.merchant ?? 'Expense';
}

export function expenseTime(expense: Expense): string {
  return expense.spent_at
    ? new Date(expense.spent_at).toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';
}

export function expenseDay(expense: Expense): string {
  return expense.spent_at ? localDateString(new Date(expense.spent_at)) : '';
}

/** Narrow to a day, then pick the expense on it. */
export function BoundPicker({
  legend,
  hint,
  date,
  onDateChange,
  bounds,
  expenses,
  selectedId,
  onSelect,
}: {
  legend: string;
  hint: string;
  date: string;
  onDateChange: (date: string) => void;
  bounds: { min: string; max: string } | null;
  expenses: Expense[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  return (
    <fieldset className="space-y-2 rounded-2xl border border-line p-3">
      <legend className="px-1 text-sm font-medium text-ink-2">{legend}</legend>
      <label className="block space-y-1">
        <span className="text-xs text-ink-4">{hint}</span>
        <input
          type="date"
          value={date}
          min={bounds?.min}
          max={bounds?.max}
          onChange={(e) => onDateChange(e.target.value)}
          className={inputClass}
        />
      </label>

      {expenses.length === 0 ? (
        <p className="rounded-xl bg-surface-2 px-3 py-3 text-center text-sm text-ink-3">
          Nothing logged on this day.
        </p>
      ) : (
        <ul className="max-h-40 overflow-y-auto rounded-xl border border-line">
          {expenses.map((expense) => {
            const selected = expense.id === selectedId;
            return (
              <li key={expense.id}>
                <button
                  type="button"
                  onClick={() => onSelect(expense.id)}
                  className={`flex w-full items-center gap-2 border-b border-line-soft px-3 py-2 text-left last:border-0 ${
                    selected ? 'bg-brand-50' : 'active:bg-surface-2'
                  }`}
                >
                  <span className="w-12 shrink-0 text-xs text-ink-4 tabular-nums">
                    {expenseTime(expense)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">
                    {expenseLabel(expense)}
                  </span>
                  <span className="shrink-0 text-xs text-ink-3 tabular-nums">
                    {formatMoney(expense.total_minor, expense.currency)}
                  </span>
                  {selected && <Check className="size-4 shrink-0 text-brand-600" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </fieldset>
  );
}
