import { useState } from 'react';
import type { FormEvent } from 'react';
import { useAddExpense } from '../hooks/useData';
import { COMMON_CURRENCIES } from '../lib/format';
import { CurrencyRateField } from './CurrencyRateField';
import { Sheet, inputClass, labelClass } from './Sheet';

function localDateTimeValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

export function AddExpenseSheet({
  baseCurrency,
  onClose,
}: {
  baseCurrency: string;
  onClose: () => void;
}) {
  const addExpense = useAddExpense();
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState(baseCurrency);
  const [merchant, setMerchant] = useState('');
  const [note, setNote] = useState('');
  const [spentAt, setSpentAt] = useState(() => localDateTimeValue(new Date()));
  const [rate, setRate] = useState<number | null>(null);
  const [rateEdited, setRateEdited] = useState(false);

  const numericAmount = Number(amount) || 0;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (numericAmount <= 0) return;
    addExpense.mutate(
      {
        total: numericAmount,
        currency,
        merchant: merchant.trim() || null,
        note: note.trim() || null,
        spent_at: new Date(spentAt).toISOString(),
        // Only send a rate the user actually vouched for; otherwise the server
        // fetches one and queues the expense for confirmation.
        fx_rate: currency !== baseCurrency && rateEdited ? rate : null,
      },
      { onSuccess: onClose },
    );
  }

  return (
    <Sheet title="Add expense" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-slate-500">
          For spending with no receipt photo — cash, a fare, a tip, your share of a bill.
        </p>

        <div className="flex gap-2">
          <label className="flex-1 space-y-1">
            <span className={labelClass}>Amount</span>
            <input
              autoFocus
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
          onRateChange={(value, edited) => {
            setRate(value);
            if (edited) setRateEdited(true);
          }}
        />

        <label className="block space-y-1">
          <span className={labelClass}>What / where</span>
          <input
            value={merchant}
            onChange={(e) => setMerchant(e.target.value)}
            placeholder="Taxi to airport"
            className={inputClass}
          />
        </label>

        <label className="block space-y-1">
          <span className={labelClass}>When</span>
          <input
            type="datetime-local"
            value={spentAt}
            onChange={(e) => setSpentAt(e.target.value)}
            className={inputClass}
          />
          <span className="text-xs text-slate-400">
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

        {addExpense.isError && (
          <p className="text-sm text-rose-600">{addExpense.error.message}</p>
        )}

        <button
          type="submit"
          disabled={addExpense.isPending || numericAmount <= 0}
          className="w-full rounded-xl bg-brand-600 py-3 text-base font-semibold text-white active:bg-brand-700 disabled:opacity-50"
        >
          {addExpense.isPending ? 'Saving…' : 'Save expense'}
        </button>
      </form>
    </Sheet>
  );
}
