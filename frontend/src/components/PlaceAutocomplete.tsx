import { MapPin, Star, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { apiJson } from '../lib/api';
import type { PlaceSuggestion } from '../types';
import { inputClass } from './Sheet';

const DEBOUNCE_MS = 250;

/**
 * Free-text "Where" field with suggestions drawn from the places you were at
 * around `at` — visited places first, Google only as a fallback.
 */
export function PlaceAutocomplete({
  value,
  placeId,
  at,
  onChange,
  inline = false,
}: {
  value: string;
  placeId: number | null;
  at: string | null;
  onChange: (name: string, placeId: number | null) => void;
  /** Let the list take room in the layout instead of floating over what is
   *  under it. For a field whose Save button sits directly below — floating
   *  there hides the one control the user is looking for. */
  inline?: boolean;
}) {
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      const params = new URLSearchParams({ q: value });
      if (at) params.set('at', new Date(at).toISOString());
      try {
        const results = await apiJson<PlaceSuggestion[]>(`/api/places/suggest?${params}`);
        if (!cancelled) setSuggestions(results);
      } catch {
        if (!cancelled) setSuggestions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [value, at, open]);

  useEffect(() => () => clearTimeout(blurTimer.current), []);

  return (
    <div className="relative">
      <div className="relative">
        <input
          role="combobox"
          aria-expanded={open && suggestions.length > 0}
          aria-controls="place-suggestions"
          aria-autocomplete="list"
          value={value}
          onChange={(e) => onChange(e.target.value, null)}
          onFocus={() => setOpen(true)}
          // Delay so a tap on a suggestion registers before the list closes
          onBlur={() => {
            blurTimer.current = setTimeout(() => setOpen(false), 150);
          }}
          placeholder="Search a place, or just type it"
          className={`${inputClass} ${placeId ? 'pl-9' : ''}`}
        />
        {placeId != null && (
          <>
            <MapPin className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-brand-600" />
            <button
              type="button"
              aria-label="Unlink place"
              onClick={() => onChange(value, null)}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-ink-4 active:bg-surface-2"
            >
              <X className="size-4" />
            </button>
          </>
        )}
      </div>

      {open && (suggestions.length > 0 || loading) && (
        <ul
          id="place-suggestions"
          role="listbox"
          className={`z-10 mt-1 max-h-60 overflow-y-auto rounded-xl border border-line bg-surface py-1 ${
            inline ? 'shadow-sm' : 'absolute inset-x-0 top-full shadow-lg'
          }`}
        >
          {loading && suggestions.length === 0 && (
            <li className="px-3 py-2 text-sm text-ink-4">Searching…</li>
          )}
          {suggestions.map((place) => (
            <li key={place.id} role="option" aria-selected={place.id === placeId}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(place.name, place.id);
                  setOpen(false);
                }}
                className="flex w-full items-start gap-2 px-3 py-2 text-left active:bg-surface-2"
              >
                {place.source === 'visited' ? (
                  <Star className="mt-0.5 size-4 shrink-0 text-money" />
                ) : (
                  <MapPin className="mt-0.5 size-4 shrink-0 text-ink-4" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">
                    {place.name}
                  </span>
                  {place.formatted_address && (
                    <span className="block truncate text-xs text-ink-4">
                      {place.formatted_address}
                    </span>
                  )}
                </span>
                {place.distance_m != null && (
                  <span className="shrink-0 text-xs text-ink-4 tabular-nums">
                    {place.distance_m < 1000
                      ? `${Math.round(place.distance_m)} m`
                      : `${(place.distance_m / 1000).toFixed(1)} km`}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
