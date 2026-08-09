import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';

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
  onSubmit: (email: string, password: string) => Promise<void>;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await onSubmit(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col justify-center bg-surface-2 px-6 py-12">
      <div className="mx-auto w-full max-w-sm">
        <img src="/icon-192.png" alt="" className="mx-auto size-24" />
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
          {error && <p className="text-sm text-danger">{error}</p>}
          <button
            type="submit"
            disabled={busy}
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
