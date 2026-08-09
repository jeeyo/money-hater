import { Loader2, LocateFixed, LogOut, Monitor, Moon, Sun } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import type { Theme } from '../context/ThemeContext';
import { useUpdateSettings } from '../hooks/useData';

const THEMES: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
];

const GEOLOCATION_TIMEOUT_MS = 15000;

/** Why the browser would not say where we are, in words worth reading.
 *
 * The failure is normally the user's to fix — a denied prompt, a self-hosted
 * install reached over plain http — so the reason has to reach the screen.
 */
function geolocationMessage(error: GeolocationPositionError): string {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return 'Location permission was denied. Allow it for this site in your browser settings, then try again.';
    case error.POSITION_UNAVAILABLE:
      return 'Your device could not get a location fix right now. Try again outdoors or with GPS on.';
    case error.TIMEOUT:
      return 'Timed out waiting for a location fix. Try again.';
    default:
      return error.message || 'Could not get your location.';
  }
}

export function SettingsPage() {
  const { user, logout, refreshUser } = useAuth();
  const { theme, setTheme } = useTheme();
  const update = useUpdateSettings();
  const [currency, setCurrency] = useState(user?.preferred_currency ?? 'USD');
  const [homeLabel, setHomeLabel] = useState(user?.home_label ?? '');
  const [homeLat, setHomeLat] = useState(user?.home_lat?.toString() ?? '');
  const [homeLng, setHomeLng] = useState(user?.home_lng?.toString() ?? '');
  const [saved, setSaved] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const waitTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(waitTimer.current), []);

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

  function finish(message: string | null) {
    clearTimeout(waitTimer.current);
    setLocating(false);
    setLocationError(message);
  }

  function useCurrentLocation() {
    setLocationError(null);
    // Browsers hand out geolocation only on a secure origin, and a blocked
    // call never reaches either callback — so it has to be caught here, or
    // the button looks broken.
    if (!window.isSecureContext) {
      setLocationError('Location needs a secure connection — open this site over https.');
      return;
    }
    if (!navigator.geolocation) {
      setLocationError('This browser cannot report your location.');
      return;
    }
    setLocating(true);

    // getCurrentPosition's own `timeout` only starts once permission has been
    // decided, so a prompt that is dismissed rather than answered leaves both
    // callbacks unfired and the button spinning for good. This is the wall
    // clock that always stops it; a real answer arriving later still wins.
    waitTimer.current = setTimeout(
      () =>
        finish(
          'Still waiting for your browser to allow this. Look for the location prompt, then try again.',
        ),
      GEOLOCATION_TIMEOUT_MS,
    );

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setHomeLat(position.coords.latitude.toFixed(6));
        setHomeLng(position.coords.longitude.toFixed(6));
        finish(null);
      },
      (error) => finish(geolocationMessage(error)),
      { enableHighAccuracy: true, timeout: GEOLOCATION_TIMEOUT_MS, maximumAge: 60000 },
    );
  }

  const inputClass =
    'w-full rounded-xl border border-line-strong bg-surface px-4 py-2.5 text-base outline-none focus:border-brand-500';

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-bold text-ink">Settings</h1>
      <p className="text-sm text-ink-3">{user?.email}</p>

      <div className="space-y-1">
        <span className="text-sm font-medium text-ink-2">Appearance</span>
        <div className="flex gap-2 rounded-xl border border-line bg-surface p-1">
          {THEMES.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => setTheme(value)}
              aria-pressed={theme === value}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium transition-colors ${
                theme === value ? 'bg-brand-50 text-brand-700' : 'text-ink-3 active:bg-surface-2'
              }`}
            >
              <Icon className="size-4" /> {label}
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={save} className="space-y-4">
        <label className="block space-y-1">
          <span className="text-sm font-medium text-ink-2">Preferred currency</span>
          <input
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            maxLength={3}
            className={inputClass}
            placeholder="USD"
          />
          <span className="text-xs text-ink-4">
            Used when a receipt doesn't state its currency.
          </span>
        </label>

        <fieldset className="space-y-2 rounded-2xl border border-line bg-surface p-4">
          <legend className="px-1 text-sm font-medium text-ink-2">Home location</legend>
          <p className="text-xs text-ink-4">
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
            disabled={locating}
            className="flex items-center gap-2 text-sm font-medium text-brand-600 disabled:opacity-60"
          >
            {locating ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Locating…
              </>
            ) : (
              <>
                <LocateFixed className="size-4" /> Use current location
              </>
            )}
          </button>
          {locationError && (
            <p role="alert" className="text-xs text-danger">
              {locationError}
            </p>
          )}
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
        className="flex items-center gap-2 text-sm font-medium text-danger"
      >
        <LogOut className="size-4" /> Sign out
      </button>
    </div>
  );
}
