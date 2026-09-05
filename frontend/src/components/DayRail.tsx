import { useMemo } from 'react';
import type { Expense, Visit } from '../types';
import { ExpenseCard } from './ExpenseCard';
import { VisitCard } from './VisitCard';

type Entry =
  | { kind: 'visit'; at: string; visit: Visit }
  | { kind: 'expense'; at: string; expense: Expense };

/**
 * One day as a single chronological rail: the stops you made, and the money
 * that belongs to no stop, in the order they happened.
 *
 * Spending used to be a number in a banner unless a photograph carried it, so
 * a day of nothing but cash fares looked like a day where nothing happened.
 * An expense is an entry here on the same footing as a stop — placed by the
 * time it was spent, so a taxi between two places sits between them.
 */
export function DayRail({ visits, expenses }: { visits: Visit[]; expenses: Expense[] }) {
  const entries = useMemo<Entry[]>(() => {
    const rows: Entry[] = [
      ...visits.map((visit): Entry => ({ kind: 'visit', at: visit.started_at, visit })),
      // An expense with no time of its own sorts last rather than to 1970
      ...expenses.map((expense): Entry => ({
        kind: 'expense',
        at: expense.spent_at ?? '9999',
        expense,
      })),
    ];
    return rows.sort((a, b) => a.at.localeCompare(b.at));
  }, [visits, expenses]);

  if (entries.length === 0) return null;

  return (
    <div className="space-y-3 border-l border-line [&>*]:-ml-px">
      {entries.map((entry) =>
        entry.kind === 'visit' ? (
          <VisitCard key={`v${entry.visit.id}`} visit={entry.visit} />
        ) : (
          <ExpenseCard key={`e${entry.expense.id}`} expense={entry.expense} />
        ),
      )}
    </div>
  );
}
