import { useState } from 'react';
import type { FormEvent } from 'react';
import { useAddExpense, useUpdateExpense } from '../hooks/useData';
import type { ExpenseInput } from '../hooks/useData';
import { COMMON_CURRENCIES, toMajor } from '../lib/format';
import type { Expense } from '../types';
import { CurrencyRateField } from './CurrencyRateField';
import { PlaceAutocomplete } from './PlaceAutocomplete';
import { Sheet, inputClass, labelClass } from './Sheet';

function localDateTimeValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

/**
 * One form for logging a new expense and for correcting an existing one —
 * including receipts the vision model misread.
 */
export function ExpenseSheet({
  baseCurrency,
  expense,
  onClose,
}: {
  baseCurrency: string;
  expense?: Expense;
  onClose: () => void;
}) {
  const editing = expense != null;
  const addExpense = useAddExpense();
  const updateExpense = useUpdateExpense();
  const mutation = editing ? updateExpense : addExpense;

  const [amount, setAmount] = useState(
    expense ? String(toMajor(expense.total_minor, expense.currency)) : '',
  );
  const [currency, setCurrency] = useState(expense?.currency ?? baseCurrency);
  const [description, setDescription] = useState(expense?.description ?? '');
  const [where, setWhere] = useState(expense?.place?.name ?? expense?.merchant ?? '');
  const [placeId, setPlaceId] = useState<number | null>(expense?.place?.id ?? null);
  const [note, setNote] = useState(expense?.note ?? '');
  const [spentAt, setSpentAt] = useState(() =>
    localDateTimeValue(expense?.spent_at ? new Date(expense.spent_at) : new Date()),
  );
  const [rate, setRate] = useState<number | null>(expense?.fx_rate ?? null);
  const [rateEdited, setRateEdited] = useState(false);

  const numericAmount = Number(amount) || 0;
  const currencyChanged = editing && currency !== expense.currency;
  const isForeign = currency !== baseCurrency;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (numericAmount <= 0) return;

    const body: ExpenseInput = {
      total: numericAmount,
      currency,
      description: description.trim() || null,
      merchant: where.trim() || null,
      place_id: placeId,
      note: note.trim() || null,
      spent_at: new Date(spentAt).toISOString(),
    };
    // Send a rate only when the user vouched for it; otherwise the server
    // looks one up and queues the expense for confirmation.
    if (isForeign && (rateEdited || (editing && !currencyChanged && rate != null))) {
      body.fx_rate = rate;
    }
    if (expense) {
      updateExpense.mutate({ id: expense.id, ...body }, { onSuccess: onClose });
    } else {
      addExpense.mutate(body, { onSuccess: onClose });
    }
  }

  return (
    <Sheet title={editing ? 'Edit expense' : 'Add expense'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {editing ? (
          expense.source === 'receipt' && (
            <p className="rounded-xl bg-surface-2 px-3 py-2 text-sm text-ink-3">
              Read from a receipt photo. Your edits win over what was detected.
            </p>
          )
        ) : (
          <p className="text-sm text-ink-3">
            For spending with no receipt photo — cash, a fare, a tip, your share of a bill.
          </p>
        )}

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
              onChange={(e) => {
                setCurrency(e.target.value);
                setRate(null);
                setRateEdited(false);
              }}
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

        <CurrencyRateField
          amount={numericAmount}
          currency={currency}
          baseCurrency={baseCurrency}
          rate={rate}
          // Keep a rate already confirmed on this expense; only auto-adopt
          // today's rate for a new expense or a changed currency.
          autoAdopt={!editing || currencyChanged}
          onRateChange={(value, edited) => {
            setRate(value);
            if (edited) setRateEdited(true);
          }}
        />

        <label className="block space-y-1">
          <span className={labelClass}>What</span>
          <input
            autoFocus={editing}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Taxi to the airport"
            className={inputClass}
          />
        </label>

        <div className="space-y-1">
          <span className={labelClass}>Where</span>
          <PlaceAutocomplete
            value={where}
            placeId={placeId}
            at={spentAt}
            onChange={(name, id) => {
              setWhere(name);
              setPlaceId(id);
            }}
          />
          <span className="block text-xs text-ink-4">
            Suggests places from where you were at that time.
          </span>
        </div>

        <label className="block space-y-1">
          <span className={labelClass}>When</span>
          <input
            type="datetime-local"
            value={spentAt}
            onChange={(e) => setSpentAt(e.target.value)}
            className={inputClass}
          />
          <span className="text-xs text-ink-4">
            Lands on the stop you were at, if there is one.
          </span>
        </label>

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
          {mutation.isPending ? 'Saving…' : editing ? 'Save changes' : 'Save expense'}
        </button>
      </form>
    </Sheet>
  );
}
