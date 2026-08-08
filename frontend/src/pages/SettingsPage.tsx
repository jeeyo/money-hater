import { LocateFixed, LogOut } from 'lucide-react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { useUpdateSettings } from '../hooks/useData';

export function SettingsPage() {
  const { user, logout, refreshUser } = useAuth();
  const update = useUpdateSettings();
  const [currency, setCurrency] = useState(user?.preferred_currency ?? 'USD');
  const [homeLabel, setHomeLabel] = useState(user?.home_label ?? '');
  const [homeLat, setHomeLat] = useState(user?.home_lat?.toString() ?? '');
  const [homeLng, setHomeLng] = useState(user?.home_lng?.toString() ?? '');
  const [saved, setSaved] = useState(false);

  function save(event: FormEvent) {
    event.preventDefault();
    update.mutate(
      {
        preferred_currency: currency.toUpperCase(),
        home_label: homeLabel || null,
        home_lat: homeLat ? Number(homeLat) : null,
        home_lng: homeLng ? Number(homeLng) : null,
      },
      {
        onSuccess: async () => {
          await refreshUser();
          setSaved(true);
          setTimeout(() => setSaved(false), 2000);
        },
      },
    );
  }

  function useCurrentLocation() {
    navigator.geolocation?.getCurrentPosition((position) => {
      setHomeLat(position.coords.latitude.toFixed(6));
      setHomeLng(position.coords.longitude.toFixed(6));
    });
  }

  const inputClass =
    'w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-base outline-none focus:border-brand-500';

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-bold text-slate-900">Settings</h1>
      <p className="text-sm text-slate-500">{user?.email}</p>

      <form onSubmit={save} className="space-y-4">
        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate-700">Preferred currency</span>
          <input
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            maxLength={3}
            className={inputClass}
            placeholder="USD"
          />
          <span className="text-xs text-slate-400">
            Used when a receipt doesn't state its currency.
          </span>
        </label>

        <fieldset className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4">
          <legend className="px-1 text-sm font-medium text-slate-700">Home location</legend>
          <p className="text-xs text-slate-400">
            Helps label short round-trips from home as commutes.
          </p>
          <input
            value={homeLabel}
            onChange={(e) => setHomeLabel(e.target.value)}
            className={inputClass}
            placeholder="Label (e.g. Home)"
          />
          <div className="flex gap-2">
            <input
              value={homeLat}
              onChange={(e) => setHomeLat(e.target.value)}
              className={inputClass}
              placeholder="Latitude"
              inputMode="decimal"
            />
            <input
              value={homeLng}
              onChange={(e) => setHomeLng(e.target.value)}
              className={inputClass}
              placeholder="Longitude"
              inputMode="decimal"
            />
          </div>
          <button
            type="button"
            onClick={useCurrentLocation}
            className="flex items-center gap-2 text-sm font-medium text-brand-600"
          >
            <LocateFixed className="size-4" /> Use current location
          </button>
        </fieldset>

        <button
          type="submit"
          disabled={update.isPending}
          className="w-full rounded-xl bg-brand-600 py-3 text-base font-semibold text-white active:bg-brand-700 disabled:opacity-50 sm:w-auto sm:px-8"
        >
          {saved ? 'Saved ✓' : 'Save settings'}
        </button>
      </form>

      <button
        type="button"
        onClick={logout}
        className="flex items-center gap-2 text-sm font-medium text-rose-600"
      >
        <LogOut className="size-4" /> Sign out
      </button>
    </div>
  );
}
