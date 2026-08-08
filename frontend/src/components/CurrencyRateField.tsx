import { RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useRateQuote } from '../hooks/useData';
import { formatMoney, toMinor } from '../lib/format';
import { inputClass, labelClass } from './Sheet';

/**
 * Shows today's rate for a foreign amount and lets the user override it —
 * a card or a money changer rarely matches the reference rate exactly.
 */
export function CurrencyRateField({
  amount,
  currency,
  baseCurrency,
  rate,
  autoAdopt = true,
  onRateChange,
}: {
  amount: number;
  currency: string;
  baseCurrency: string;
  rate: number | null;
  /** False when editing an expense whose rate was already settled. */
  autoAdopt?: boolean;
  onRateChange: (rate: number | null, edited: boolean) => void;
}) {
  const { data: quote, isLoading, refetch } = useRateQuote(currency, baseCurrency);
  const [edited, setEdited] = useState(false);

  // Adopt the fetched rate until the user types their own
  useEffect(() => {
    if (autoAdopt && !edited && quote?.rate != null) onRateChange(quote.rate, false);
  }, [quote?.rate, edited, autoAdopt, onRateChange]);

  if (currency === baseCurrency) return null;

  const converted = rate != null && amount > 0 ? toMinor(amount * rate, baseCurrency) : null;

  return (
    <div className="space-y-2 rounded-xl bg-money-bg p-3">
      <div className="flex items-center justify-between">
        <span className={labelClass}>
          Rate — 1 {currency} in {baseCurrency}
        </span>
        <button
          type="button"
          onClick={() => {
            setEdited(false);
            refetch();
          }}
          className="flex items-center gap-1 text-xs font-medium text-money"
        >
          <RefreshCw className={`size-3 ${isLoading ? 'animate-spin' : ''}`} /> today's rate
        </button>
      </div>
      <input
        type="number"
        step="any"
        inputMode="decimal"
        value={rate ?? ''}
        placeholder={isLoading ? 'Fetching…' : 'e.g. 0.235'}
        onChange={(e) => {
          setEdited(true);
          onRateChange(e.target.value ? Number(e.target.value) : null, true);
        }}
        className={inputClass}
      />
      {converted != null ? (
        <p className="text-sm text-money">
          = <span className="font-semibold">{formatMoney(converted, baseCurrency)}</span>
          {!edited && quote?.rate != null && (
            <span className="ml-1 text-xs text-money">at today's rate</span>
          )}
        </p>
      ) : (
        <p className="text-xs text-money">
          No rate available — enter the rate you got to convert this.
        </p>
      )}
    </div>
  );
}
