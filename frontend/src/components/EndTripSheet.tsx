import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useEndTrip, useExpenses } from '../hooks/useData';
import { localDateString } from '../lib/format';
import type { TripDetail } from '../types';
import { BoundPicker, expenseDay } from './BoundPicker';
import { Sheet } from './Sheet';

/** Close a trip at an expense other than the latest one — it ended earlier. */
export function EndTripSheet({ trip, onClose }: { trip: TripDetail; onClose: () => void }) {
  const { data: expenses } = useExpenses();
  const endTrip = useEndTrip(trip.id);
  const [endId, setEndId] = useState<number | null>(null);

  const firstDay = localDateString(new Date(trip.started_at));
  const lastDay = localDateString(new Date());

  // Only expenses inside the trip can end it, so clamp the picker to its days.
  const dated = useMemo(
    () =>
      [...(expenses ?? [])]
        .filter((e) => e.spent_at)
        .filter((e) => expenseDay(e) >= firstDay && expenseDay(e) <= lastDay)
        .sort((a, b) => (a.spent_at ?? '').localeCompare(b.spent_at ?? '')),
    [expenses, firstDay, lastDay],
  );

  const [chosenDay, setChosenDay] = useState<string | null>(null);
  const day = chosenDay ?? lastDay;
  const options = useMemo(() => dated.filter((e) => expenseDay(e) === day), [dated, day]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (endId == null) return;
    endTrip.mutate({ end_expense_id: endId }, { onSuccess: onClose });
  }

  return (
    <Sheet title="End the trip" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-ink-3">
          Pick the expense “{trip.title}” ended with — the taxi home. Days after it stop counting
          towards the trip.
        </p>

        <BoundPicker
          legend="Ended with"
          hint="Last day of the trip"
          date={day}
          onDateChange={(value) => {
            setChosenDay(value);
            setEndId(null);
          }}
          bounds={{ min: firstDay, max: lastDay }}
          expenses={options}
          selectedId={endId}
          onSelect={setEndId}
        />

        {endTrip.isError && <p className="text-sm text-danger">{endTrip.error.message}</p>}

        <button
          type="submit"
          disabled={endId == null || endTrip.isPending}
          className="w-full rounded-xl bg-brand-600 py-3 text-base font-semibold text-white active:bg-brand-700 disabled:opacity-50"
        >
          {endTrip.isPending ? 'Ending…' : 'End trip here'}
        </button>
      </form>
    </Sheet>
  );
}
