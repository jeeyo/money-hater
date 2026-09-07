import { useState } from 'react';
import type { FormEvent } from 'react';
import { useAddSubscription, useUpdateSubscription } from '../hooks/useData';
import type { SubscriptionInput } from '../hooks/useData';
import { COMMON_CURRENCIES, toMajor } from '../lib/format';
import type { Subscription } from '../types';
import { PlaceAutocomplete } from './PlaceAutocomplete';
import { Sheet, inputClass, labelClass } from './Sheet';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Add or edit a subscription: What, Where, an amount, and a monthly or
 *  yearly schedule. There is no "when did this last charge" field — that
 *  comes from what already happened, not from this form. */
export function SubscriptionSheet({
  baseCurrency,
  subscription,
  onClose,
}: {
  baseCurrency: string;
  subscription?: Subscription;
  onClose: () => void;
}) {
  const editing = subscription != null;
  const addSubscription = useAddSubscription();
  const updateSubscription = useUpdateSubscription();
  const mutation = editing ? updateSubscription : addSubscription;

  const [amount, setAmount] = useState(
    subscription ? String(toMajor(subscription.amount_minor, subscription.currency)) : '',
  );
  const [currency, setCurrency] = useState(subscription?.currency ?? baseCurrency);
  const [description, setDescription] = useState(subscription?.description ?? '');
  const [where, setWhere] = useState(subscription?.place?.name ?? subscription?.merchant ?? '');
  const [placeId, setPlaceId] = useState<number | null>(subscription?.place?.id ?? null);
  const [interval, setInterval] = useState<'monthly' | 'yearly'>(
    subscription?.interval ?? 'monthly',
  );
  const [dayOfMonth, setDayOfMonth] = useState(subscription?.day_of_month ?? new Date().getDate());
  const [month, setMonth] = useState(subscription?.month ?? new Date().getMonth() + 1);
  const [note, setNote] = useState(subscription?.note ?? '');

  const numericAmount = Number(amount) || 0;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (numericAmount <= 0) return;

    const body: SubscriptionInput = {
      amount: numericAmount,
      currency,
      description: description.trim() || null,
      merchant: where.trim() || null,
      place_id: placeId,
      interval,
      day_of_month: dayOfMonth,
      month: interval === 'yearly' ? month : null,
      note: note.trim() || null,
    };
    if (subscription) {
      updateSubscription.mutate({ id: subscription.id, ...body }, { onSuccess: onClose });
    } else {
      addSubscription.mutate(body, { onSuccess: onClose });
    }
  }

  return (
    <Sheet title={editing ? 'Edit subscription' : 'New subscription'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-ink-3">
          Creates its own expense automatically on this schedule. Editing only changes what
          happens next — expenses already created keep what they were given at the time.
        </p>

        <div className="flex gap-2">
          <label className="flex-1 space-y-1">
            <span className={labelClass}>Amount</span>
            <input
              autoFocus={!editing}
              type="number"
              step="any"
              min="0"
              inputMode="decimal"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className={inputClass}
            />
          </label>
          <label className="w-32 space-y-1">
            <span className={labelClass}>Currency</span>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className={inputClass}
            >
              {[baseCurrency, ...COMMON_CURRENCIES.filter((c) => c !== baseCurrency)].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="block space-y-1">
          <span className={labelClass}>What</span>
          <input
            autoFocus={editing}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Streaming subscription"
            className={inputClass}
          />
        </label>

        <div className="space-y-1">
          <span className={labelClass}>Where</span>
          <PlaceAutocomplete
            value={where}
            placeId={placeId}
            at={null}
            onChange={(name, id) => {
              setWhere(name);
              setPlaceId(id);
            }}
          />
        </div>

        <div className="space-y-1">
          <span className={labelClass}>Repeats</span>
          <div className="flex gap-2">
            {(['monthly', 'yearly'] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setInterval(value)}
                className={`flex-1 rounded-xl border px-3 py-2 text-sm font-medium capitalize ${
                  interval === value
                    ? 'border-brand-500 bg-brand-50 text-brand-700'
                    : 'border-line-strong text-ink-2'
                }`}
              >
                {value}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          {interval === 'yearly' && (
            <label className="flex-1 space-y-1">
              <span className={labelClass}>Month</span>
              <select
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                className={inputClass}
              >
                {MONTH_NAMES.map((name, i) => (
                  <option key={name} value={i + 1}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="flex-1 space-y-1">
            <span className={labelClass}>Day</span>
            <select
              value={dayOfMonth}
              onChange={(e) => setDayOfMonth(Number(e.target.value))}
              className={inputClass}
            >
              {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="block space-y-1">
          <span className={labelClass}>Note</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="optional"
            className={inputClass}
          />
        </label>

        {mutation.isError && <p className="text-sm text-danger">{mutation.error.message}</p>}

        <button
          type="submit"
          disabled={mutation.isPending || numericAmount <= 0}
          className="w-full rounded-xl bg-brand-600 py-3 text-base font-semibold text-white active:bg-brand-700 disabled:opacity-50"
        >
          {mutation.isPending ? 'Saving…' : editing ? 'Save changes' : 'Add subscription'}
        </button>
      </form>
    </Sheet>
  );
}
