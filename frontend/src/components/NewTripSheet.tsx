import { Check } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useCreateTrip, useExpenses } from '../hooks/useData';
import { formatMoney, localDateString } from '../lib/format';
import type { Expense } from '../types';
import { Sheet, inputClass, labelClass } from './Sheet';

function expenseLabel(expense: Expense): string {
  return expense.description ?? expense.place?.name ?? expense.merchant ?? 'Expense';
}

function expenseTime(expense: Expense): string {
  return expense.spent_at
    ? new Date(expense.spent_at).toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';
}

function expenseDay(expense: Expense): string {
  return expense.spent_at ? localDateString(new Date(expense.spent_at)) : '';
}

/** Narrow to a day, then pick the expense on it. */
function BoundPicker({
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

export function NewTripSheet({ onClose }: { onClose: () => void }) {
  const { data: expenses } = useExpenses();
  const createTrip = useCreateTrip();
  const [title, setTitle] = useState('');
  const [startId, setStartId] = useState<number | null>(null);
  const [endId, setEndId] = useState<number | null>(null);

  const dated = useMemo(
    () =>
      [...(expenses ?? [])]
        .filter((e) => e.spent_at)
        .sort((a, b) => (a.spent_at ?? '').localeCompare(b.spent_at ?? '')),
    [expenses],
  );

  const bounds = dated.length
    ? { min: expenseDay(dated[0]), max: expenseDay(dated[dated.length - 1]) }
    : null;
  // Until a day is chosen, follow the data: the most recent day always has
  // something to pick, and expenses arrive after the first render.
  const [chosenStart, setChosenStart] = useState<string | null>(null);
  const [chosenEnd, setChosenEnd] = useState<string | null>(null);
  const latestDay = bounds?.max ?? localDateString(new Date());
  const startDate = chosenStart ?? latestDay;
  const endDate = chosenEnd ?? latestDay;

  const startOptions = useMemo(
    () => dated.filter((e) => expenseDay(e) === startDate),
    [dated, startDate],
  );
  const endOptions = useMemo(
    () => dated.filter((e) => expenseDay(e) === endDate),
    [dated, endDate],
  );

  const start = dated.find((e) => e.id === startId);
  const end = dated.find((e) => e.id === endId);
  const dayCount =
    startDate && endDate
      ? Math.round(
          (new Date(`${endDate}T00:00`).getTime() - new Date(`${startDate}T00:00`).getTime()) /
            86_400_000,
        ) + 1
      : 0;
  const valid = Boolean(start && end && dayCount >= 1);

  function pickStartDate(day: string) {
    setChosenStart(day);
    setStartId(null);
    // A trip cannot end before it starts
    if (day > endDate) {
      setChosenEnd(day);
      setEndId(null);
    }
  }

  function pickEndDate(day: string) {
    setChosenEnd(day);
    setEndId(null);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!valid || !title.trim() || !start || !end) return;
    createTrip.mutate(
      { title: title.trim(), start_expense_id: start.id, end_expense_id: end.id },
      { onSuccess: onClose },
    );
  }

  return (
    <Sheet title="New trip" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-ink-3">
          A trip groups days together. Pick the day and expense it started with, and the ones it
          ended with — everything in between belongs to the trip.
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

        {dated.length === 0 ? (
          <p className="rounded-xl bg-surface-2 px-3 py-4 text-center text-sm text-ink-3">
            No expenses yet — log one first, then you can bound a trip with it.
          </p>
        ) : (
          <>
            <BoundPicker
              legend="Started with"
              hint="First day of the trip"
              date={startDate}
              onDateChange={pickStartDate}
              bounds={bounds}
              expenses={startOptions}
              selectedId={startId}
              onSelect={setStartId}
            />
            <BoundPicker
              legend="Ended with"
              hint="Last day of the trip"
              date={endDate}
              onDateChange={pickEndDate}
              bounds={bounds ? { min: startDate, max: bounds.max } : null}
              expenses={endOptions}
              selectedId={endId}
              onSelect={setEndId}
            />
          </>
        )}

        {valid && (
          <p className="rounded-xl bg-brand-50 px-3 py-2 text-sm text-brand-700">
            {new Date(`${startDate}T00:00`).toLocaleDateString()} –{' '}
            {new Date(`${endDate}T00:00`).toLocaleDateString()} ·{' '}
            <span className="font-semibold">
              {dayCount} day{dayCount === 1 ? '' : 's'}
            </span>
          </p>
        )}
        {createTrip.isError && <p className="text-sm text-danger">{createTrip.error.message}</p>}

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
