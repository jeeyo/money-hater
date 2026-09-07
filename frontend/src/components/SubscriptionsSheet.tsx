import { Calendar, Pencil, Plus, Repeat, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useDeleteSubscription, useSubscriptions } from '../hooks/useData';
import { formatDay, formatMoney } from '../lib/format';
import type { Subscription } from '../types';
import { Sheet } from './Sheet';
import { SubscriptionSheet } from './SubscriptionSheet';

const MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function ordinal(n: number): string {
  if (n % 10 === 1 && n % 100 !== 11) return 'st';
  if (n % 10 === 2 && n % 100 !== 12) return 'nd';
  if (n % 10 === 3 && n % 100 !== 13) return 'rd';
  return 'th';
}

function scheduleLabel(subscription: Subscription): string {
  if (subscription.interval === 'monthly') {
    return `Monthly on the ${subscription.day_of_month}${ordinal(subscription.day_of_month)}`;
  }
  return `Yearly on ${MONTH_SHORT[(subscription.month ?? 1) - 1]} ${subscription.day_of_month}`;
}

function SubscriptionRow({
  subscription,
  onEdit,
}: {
  subscription: Subscription;
  onEdit: () => void;
}) {
  const remove = useDeleteSubscription();
  const whereLabel = subscription.place?.name ?? subscription.merchant;

  return (
    <li className="rounded-2xl border border-line bg-surface p-3">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
          <Repeat className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">
            {subscription.description ?? whereLabel ?? 'Subscription'}
          </p>
          <p className="truncate text-xs text-ink-3">
            {whereLabel && subscription.description ? `${whereLabel} · ` : ''}
            {scheduleLabel(subscription)}
          </p>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-4">
            <Calendar className="size-3 shrink-0" />
            Next charge {formatDay(`${subscription.next_run_on}T00:00:00Z`)}
          </p>
          {subscription.note && (
            <p className="mt-0.5 truncate text-xs text-ink-3">{subscription.note}</p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-semibold text-ink tabular-nums">
            {formatMoney(subscription.amount_minor, subscription.currency)}
          </p>
          <div className="mt-1.5 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onEdit}
              aria-label="Edit"
              className="text-ink-3 active:text-ink"
            >
              <Pencil className="size-4" />
            </button>
            <button
              type="button"
              aria-label="Delete"
              onClick={() => {
                if (
                  confirm(
                    'Delete this subscription? Expenses it already created are kept.',
                  )
                ) {
                  remove.mutate(subscription.id);
                }
              }}
              className="text-danger active:opacity-70"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        </div>
      </div>
    </li>
  );
}

export function SubscriptionsSheet({
  baseCurrency,
  onClose,
}: {
  baseCurrency: string;
  onClose: () => void;
}) {
  const { data: subscriptions, isLoading } = useSubscriptions();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Subscription | null>(null);

  return (
    <Sheet title="Subscriptions" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-ink-3">
          Recurring charges — rent, streaming, memberships. Each creates its own expense
          automatically when it's due, separate from anything you log by hand.
        </p>

        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-line-strong py-2.5 text-sm font-medium text-brand-600 active:bg-surface-2"
        >
          <Plus className="size-4" /> New subscription
        </button>

        {isLoading && <p className="py-6 text-center text-sm text-ink-4">Loading…</p>}
        {subscriptions?.length === 0 && (
          <p className="py-6 text-center text-sm text-ink-3">
            Nothing set up yet — add one above.
          </p>
        )}
        <ul className="space-y-2">
          {subscriptions?.map((subscription) => (
            <SubscriptionRow
              key={subscription.id}
              subscription={subscription}
              onEdit={() => setEditing(subscription)}
            />
          ))}
        </ul>
      </div>

      {adding && (
        <SubscriptionSheet baseCurrency={baseCurrency} onClose={() => setAdding(false)} />
      )}
      {editing && (
        <SubscriptionSheet
          baseCurrency={baseCurrency}
          subscription={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </Sheet>
  );
}
