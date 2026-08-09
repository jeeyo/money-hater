import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useCreateTrip, useExpenses, useTrips } from '../hooks/useData';
import { isOpenTrip, localDateString } from '../lib/format';
import { BoundPicker, expenseDay } from './BoundPicker';
import { Sheet, inputClass, labelClass } from './Sheet';

export function NewTripSheet({ onClose }: { onClose: () => void }) {
  const { data: expenses } = useExpenses();
  const { data: trips } = useTrips();
  const createTrip = useCreateTrip();
  const [title, setTitle] = useState('');
  const [startId, setStartId] = useState<number | null>(null);
  const [endId, setEndId] = useState<number | null>(null);
  const [stillGoing, setStillGoing] = useState(false);

  // Only one trip can be running at a time, so offer it only when none is.
  const openTrip = trips?.find(isOpenTrip);
  const canStayOpen = !openTrip;
  const ongoing = stillGoing && canStayOpen;

  const dated = useMemo(
    () =>
      [...(expenses ?? [])]
        .filter((e) => e.spent_at)
        .sort((a, b) => (a.spent_at ?? '').localeCompare(b.spent_at ?? '')),
    [expenses],
  );

  const today = localDateString(new Date());
  const bounds = dated.length
    ? { min: expenseDay(dated[0]), max: expenseDay(dated[dated.length - 1]) }
    : null;
  // Until a day is chosen, follow the data: the most recent day always has
  // something to pick, and expenses arrive after the first render.
  const [chosenStart, setChosenStart] = useState<string | null>(null);
  const [chosenEnd, setChosenEnd] = useState<string | null>(null);
  const latestDay = bounds?.max ?? today;
  const startDate = chosenStart ?? latestDay;
  const endDate = ongoing ? today : (chosenEnd ?? latestDay);

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
  const valid = Boolean(start && (ongoing || end) && dayCount >= 1);

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
    if (!valid || !title.trim() || !start) return;
    createTrip.mutate(
      {
        title: title.trim(),
        start_expense_id: start.id,
        end_expense_id: ongoing ? null : (end?.id ?? null),
      },
      { onSuccess: onClose },
    );
  }

  return (
    <Sheet title="New trip" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-ink-3">
          A trip groups days together. Pick the day and expense it started with, and the ones it
          ended with — everything in between belongs to the trip. Still on it? Leave the end open
          and today keeps joining.
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

            <label className="flex items-start gap-2.5 rounded-2xl border border-line px-3 py-2.5">
              <input
                type="checkbox"
                checked={ongoing}
                disabled={!canStayOpen}
                onChange={(e) => setStillGoing(e.target.checked)}
                className="mt-0.5 size-4 shrink-0 accent-brand-600 disabled:opacity-50"
              />
              <span className="min-w-0 text-sm">
                <span className="font-medium text-ink">Still going</span>
                <span className="block text-xs text-ink-3">
                  {canStayOpen
                    ? 'The trip runs to today and keeps growing until you end it.'
                    : `“${openTrip?.title}” is still going — end it first.`}
                </span>
              </span>
            </label>

            {!ongoing && (
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
            )}
          </>
        )}

        {valid && (
          <p className="rounded-xl bg-brand-50 px-3 py-2 text-sm text-brand-700">
            {new Date(`${startDate}T00:00`).toLocaleDateString()} –{' '}
            {ongoing ? 'now' : new Date(`${endDate}T00:00`).toLocaleDateString()} ·{' '}
            <span className="font-semibold">
              {dayCount} day{dayCount === 1 ? '' : 's'}
            </span>
            {ongoing && ' so far'}
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
