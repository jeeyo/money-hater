import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { TurnstileWidget } from '../components/TurnstileWidget';
import { useAuthConfig } from '../hooks/useData';

export function AuthForm({
  title,
  submitLabel,
  altText,
  altTo,
  altLabel,
  onSubmit,
}: {
  title: string;
  submitLabel: string;
  altText: string;
  altTo: string;
  altLabel: string;
  onSubmit: (email: string, password: string, turnstileToken?: string) => Promise<void>;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  // Bumped after every attempt: a Turnstile token is spent once, so the widget
  // is remounted to issue another rather than resubmitting a dead one.
  const [attempt, setAttempt] = useState(0);

  const { data: config, isPending } = useAuthConfig();
  const siteKey = config?.turnstile_site_key ?? null;
  // Held while we still don't know whether a check is required. If that
  // request fails outright the form opens anyway rather than trapping someone
  // behind a dead button — the server has the last word on the token either way.
  const blocked = isPending || (siteKey !== null && turnstileToken === null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await onSubmit(email, password, turnstileToken ?? undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      if (siteKey) {
        setTurnstileToken(null);
        setAttempt((n) => n + 1);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col justify-center bg-surface-2 px-6 py-12">
      <div className="mx-auto w-full max-w-sm">
        <img src="/logo.png" alt="" className="mx-auto size-24" />
        <h1 className="mt-3 text-center text-2xl font-bold text-ink">Money Hater</h1>
        <p className="mt-1 text-center text-sm text-ink-3">
          Trip logger — photos in, itinerary and spending out.
        </p>
        <h2 className="mt-8 text-lg font-semibold text-ink">{title}</h2>
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <input
            type="email"
            required
            autoComplete="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-line-strong bg-surface px-4 py-3 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30"
          />
          <input
            type="password"
            required
            minLength={8}
            autoComplete="current-password"
            placeholder="Password (min 8 characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-line-strong bg-surface px-4 py-3 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30"
          />
          {siteKey && (
            <TurnstileWidget key={attempt} siteKey={siteKey} onToken={setTurnstileToken} />
          )}
          {error && <p className="text-sm text-danger">{error}</p>}
          <button
            type="submit"
            disabled={busy || blocked}
            className="w-full rounded-xl bg-brand-600 py-3 text-base font-semibold text-white active:bg-brand-700 disabled:opacity-50"
          >
            {busy ? '…' : submitLabel}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-ink-3">
          {altText}{' '}
          <Link to={altTo} className="font-medium text-brand-600">
            {altLabel}
          </Link>
        </p>
      </div>
    </div>
  );
}
