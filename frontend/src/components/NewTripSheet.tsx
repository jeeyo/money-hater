import { Check } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useCreateTrip, useExpenses } from '../hooks/useData';
import { formatMoney } from '../lib/format';
import type { Expense } from '../types';
import { Sheet, inputClass, labelClass } from './Sheet';

function expenseLabel(expense: Expense): string {
  return expense.description ?? expense.place?.name ?? expense.merchant ?? 'Expense';
}

function expenseWhen(expense: Expense): string {
  return expense.spent_at ? new Date(expense.spent_at).toLocaleString() : 'date unknown';
}

/** Pick the expense that started the trip and the one that ended it. */
function ExpensePicker({
  expenses,
  selectedId,
  onSelect,
}: {
  expenses: Expense[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  return (
    <ul className="max-h-44 overflow-y-auto rounded-xl border border-slate-200">
      {expenses.map((expense) => {
        const selected = expense.id === selectedId;
        return (
          <li key={expense.id}>
            <button
              type="button"
              onClick={() => onSelect(expense.id)}
              className={`flex w-full items-center gap-2 border-b border-slate-100 px-3 py-2 text-left last:border-0 ${
                selected ? 'bg-brand-50' : 'active:bg-slate-50'
              }`}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-slate-800">
                  {expenseLabel(expense)}
                </span>
                <span className="block text-xs text-slate-400">{expenseWhen(expense)}</span>
              </span>
              <span className="shrink-0 text-xs text-slate-500 tabular-nums">
                {formatMoney(expense.total_minor, expense.currency)}
              </span>
              {selected && <Check className="size-4 shrink-0 text-brand-600" />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function NewTripSheet({ onClose }: { onClose: () => void }) {
  const { data: expenses } = useExpenses();
  const createTrip = useCreateTrip();
  const [title, setTitle] = useState('');
  const [startId, setStartId] = useState<number | null>(null);
  const [endId, setEndId] = useState<number | null>(null);

  // Oldest first reads like a journey: the outbound fare, then the way home
  const ordered = useMemo(
    () =>
      [...(expenses ?? [])].sort((a, b) =>
        (a.spent_at ?? '').localeCompare(b.spent_at ?? ''),
      ),
    [expenses],
  );

  const start = ordered.find((e) => e.id === startId);
  const end = ordered.find((e) => e.id === endId);
  const span =
    start && end && start.spent_at && end.spent_at
      ? {
          from: new Date(start.spent_at),
          to: new Date(end.spent_at),
        }
      : null;
  const dayCount = span
    ? Math.round(
        (new Date(span.to.toDateString()).getTime() -
          new Date(span.from.toDateString()).getTime()) /
          86_400_000,
      ) + 1
    : 0;
  const valid = start && end && span && span.to >= span.from;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!valid || !title.trim()) return;
    createTrip.mutate(
      { title: title.trim(), start_expense_id: start.id, end_expense_id: end.id },
      { onSuccess: onClose },
    );
  }

  return (
    <Sheet title="New trip" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-slate-500">
          A trip groups days together. Pick the expense it started with and the one it ended
          with — everything in between belongs to the trip.
        </p>

        <label className="block space-y-1">
          <span className={labelClass}>Name</span>
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Chiang Mai weekend"
            className={inputClass}
          />
        </label>

        {ordered.length === 0 ? (
          <p className="rounded-xl bg-slate-50 px-3 py-4 text-center text-sm text-slate-500">
            No expenses yet — log one first, then you can bound a trip with it.
          </p>
        ) : (
          <>
            <div className="space-y-1">
              <span className={labelClass}>Started with</span>
              <ExpensePicker expenses={ordered} selectedId={startId} onSelect={setStartId} />
            </div>
            <div className="space-y-1">
              <span className={labelClass}>Ended with</span>
              <ExpensePicker expenses={ordered} selectedId={endId} onSelect={setEndId} />
            </div>
          </>
        )}

        {span && !valid && (
          <p className="text-sm text-rose-600">The ending expense comes before the start.</p>
        )}
        {valid && (
          <p className="rounded-xl bg-brand-50 px-3 py-2 text-sm text-brand-700">
            {span.from.toLocaleDateString()} – {span.to.toLocaleDateString()} ·{' '}
            <span className="font-semibold">
              {dayCount} day{dayCount === 1 ? '' : 's'}
            </span>
          </p>
        )}
        {createTrip.isError && (
          <p className="text-sm text-rose-600">{createTrip.error.message}</p>
        )}

        <button
          type="submit"
          disabled={!valid || !title.trim() || createTrip.isPending}
          className="w-full rounded-xl bg-brand-600 py-3 text-base font-semibold text-white active:bg-brand-700 disabled:opacity-50"
        >
          {createTrip.isPending ? 'Creating…' : 'Create trip'}
        </button>
      </form>
    </Sheet>
  );
}
