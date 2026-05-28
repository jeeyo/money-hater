import React, { useState } from 'react';
import { Plus, Trash2, Copy, Check, KeyRound, Monitor, LogOut } from 'lucide-react';
import Layout from '../components/Layout';
import {
  useApiTokens,
  useCreateApiToken,
  useDeleteApiToken,
  type CreatedApiToken,
} from '../hooks/useApiTokens';
import {
  useSessions,
  useRevokeSession,
  useLogoutEverywhere,
  type SessionRow,
} from '../hooks/useSessions';
import { useAuth } from '../context/useAuth';
import { showToast } from '../lib/toast';

const formatDate = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : 'Never');

const summarizeUserAgent = (ua: string | null) => {
  if (!ua) return 'Unknown device';
  if (/edg/i.test(ua)) return 'Edge';
  if (/chrome/i.test(ua)) return 'Chrome';
  if (/firefox/i.test(ua)) return 'Firefox';
  if (/safari/i.test(ua)) return 'Safari';
  return ua.slice(0, 40);
};

const SettingsPage: React.FC = () => {
  const { logout } = useAuth();
  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-10">
        <div>
          <h1 className="text-2xl font-bold text-white">Settings</h1>
          <p className="text-slate-400 mt-1 text-sm">Manage your API tokens and active sessions.</p>
        </div>

        <ApiTokensSection />
        <SessionsSection onLogoutEverywhere={() => void logout()} />
      </div>
    </Layout>
  );
};

// ---------------------------------------------------------------------------
// API tokens
// ---------------------------------------------------------------------------

const ApiTokensSection: React.FC = () => {
  const { data: tokens, isLoading } = useApiTokens();
  const createToken = useCreateApiToken();
  const deleteToken = useDeleteApiToken();
  const [showCreate, setShowCreate] = useState(false);
  const [created, setCreated] = useState<CreatedApiToken | null>(null);

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Revoke API token "${name}"? Any client using it will lose access.`)) {
      return;
    }
    try {
      await deleteToken.mutateAsync(id);
      showToast('API token revoked', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to revoke token', 'error');
    }
  };

  return (
    <section>
      <header className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-violet-400" />
            API Tokens
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Long-lived bearer credentials for scripts and integrations.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-3 py-1.5 text-sm bg-gradient-to-r from-violet-600 to-indigo-500 text-white rounded-lg hover:opacity-90 transition-opacity"
        >
          <Plus className="w-4 h-4" />
          New Token
        </button>
      </header>

      <div className="bg-white/4 border border-white/8 rounded-xl overflow-hidden">
        {isLoading ? (
          <p className="p-6 text-sm text-slate-500 text-center">Loading…</p>
        ) : !tokens || tokens.length === 0 ? (
          <p className="p-6 text-sm text-slate-500 text-center">
            No API tokens yet. Create one to authenticate scripts or integrations.
          </p>
        ) : (
          <ul className="divide-y divide-white/5">
            {tokens.map((t) => (
              <li key={t.id} className="px-4 py-3 flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white truncate">{t.name}</p>
                  <p className="text-xs text-slate-500 font-mono mt-0.5">
                    {t.prefix}… · last used {formatDate(t.lastUsedAt)}
                    {t.expiresAt
                      ? ` · expires ${new Date(t.expiresAt).toLocaleDateString()}`
                      : ' · no expiry'}
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(t.id, t.name)}
                  className="ml-4 p-2 rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 transition-colors"
                  aria-label={`Revoke ${t.name}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {showCreate && (
        <CreateTokenModal
          onCancel={() => setShowCreate(false)}
          onCreated={(token) => {
            setShowCreate(false);
            setCreated(token);
          }}
          submit={(input) => createToken.mutateAsync(input)}
          isSubmitting={createToken.isPending}
        />
      )}

      {created && <RevealTokenModal token={created} onClose={() => setCreated(null)} />}
    </section>
  );
};

const CreateTokenModal: React.FC<{
  onCancel: () => void;
  onCreated: (t: CreatedApiToken) => void;
  submit: (input: { name: string; expiresAt?: string }) => Promise<CreatedApiToken>;
  isSubmitting: boolean;
}> = ({ onCancel, onCreated, submit, isSubmitting }) => {
  const [name, setName] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    try {
      const token = await submit({
        name: name.trim(),
        // <input type="date"> returns YYYY-MM-DD; expand to end-of-day ISO.
        expiresAt: expiresAt ? new Date(`${expiresAt}T23:59:59`).toISOString() : undefined,
      });
      onCreated(token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create token');
    }
  };

  return (
    <ModalShell title="New API Token" onClose={onCancel}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="api-token-name"
            className="block text-xs font-medium text-slate-400 mb-1.5"
          >
            Name
          </label>
          <input
            id="api-token-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            placeholder="e.g. My phone, n8n integration"
            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-slate-600 focus:outline-none focus:border-violet-500"
          />
        </div>
        <div>
          <label
            htmlFor="api-token-expiry"
            className="block text-xs font-medium text-slate-400 mb-1.5"
          >
            Expires (optional)
          </label>
          <input
            id="api-token-expiry"
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            min={new Date().toISOString().slice(0, 10)}
            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-violet-500"
          />
          <p className="text-[11px] text-slate-600 mt-1">Leave blank for no expiry.</p>
        </div>
        {error && <p className="text-xs text-rose-400">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 text-sm rounded-lg bg-white/4 text-slate-300 hover:bg-white/8"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-3 py-1.5 text-sm rounded-lg bg-gradient-to-r from-violet-600 to-indigo-500 text-white disabled:opacity-50"
          >
            {isSubmitting ? 'Creating…' : 'Create'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
};

const RevealTokenModal: React.FC<{ token: CreatedApiToken; onClose: () => void }> = ({
  token,
  onClose,
}) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(token.token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast('Copy failed — select and copy manually', 'error');
    }
  };

  return (
    <ModalShell title="Save this token now" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-slate-300">
          This is the only time the full token is shown. Store it somewhere safe — you can't
          retrieve it later.
        </p>
        <div className="flex items-stretch gap-2">
          <code className="flex-1 px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-xs text-amber-300 font-mono break-all">
            {token.token}
          </code>
          <button
            onClick={copy}
            className="px-3 py-2 rounded-lg bg-violet-600 text-white hover:bg-violet-500 text-sm flex items-center gap-1.5"
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <p className="text-xs text-slate-500">
          Use it as <code className="text-slate-400">Authorization: Bearer &lt;token&gt;</code> on
          any
          <code className="text-slate-400"> /api/* </code> request.
        </p>
        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm rounded-lg bg-white/4 text-slate-300 hover:bg-white/8"
          >
            Done
          </button>
        </div>
      </div>
    </ModalShell>
  );
};

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

const SessionsSection: React.FC<{ onLogoutEverywhere: () => void }> = ({ onLogoutEverywhere }) => {
  const { data: sessions, isLoading } = useSessions();
  const revoke = useRevokeSession();
  const logoutEverywhere = useLogoutEverywhere();

  const handleRevoke = async (s: SessionRow) => {
    if (s.current) return;
    if (
      !window.confirm('Revoke this session? The device will be signed out on its next request.')
    ) {
      return;
    }
    try {
      await revoke.mutateAsync(s.id);
      showToast('Session revoked', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to revoke session', 'error');
    }
  };

  const handleLogoutEverywhere = async () => {
    if (
      !window.confirm(
        'Sign out of all sessions, including this one? Other devices will be signed out within an hour.',
      )
    ) {
      return;
    }
    try {
      await logoutEverywhere.mutateAsync();
      // Server cleared our cookies; tell AuthContext to clear local state and redirect.
      onLogoutEverywhere();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to log out everywhere', 'error');
    }
  };

  return (
    <section>
      <header className="mb-4">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <Monitor className="w-4 h-4 text-violet-400" />
          Active Sessions
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Each browser/device you've logged in from. Revoke any you don't recognize.
        </p>
      </header>

      <div className="bg-white/4 border border-white/8 rounded-xl overflow-hidden">
        {isLoading ? (
          <p className="p-6 text-sm text-slate-500 text-center">Loading…</p>
        ) : !sessions || sessions.length === 0 ? (
          <p className="p-6 text-sm text-slate-500 text-center">No active sessions.</p>
        ) : (
          <ul className="divide-y divide-white/5">
            {sessions.map((s) => (
              <li key={s.id} className="px-4 py-3 flex items-center justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-white truncate">
                      {summarizeUserAgent(s.userAgent)}
                    </p>
                    {s.current && (
                      <span className="text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300">
                        Current
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Started {formatDate(s.createdAt)} · last seen {formatDate(s.lastSeenAt)}
                  </p>
                </div>
                <button
                  onClick={() => handleRevoke(s)}
                  disabled={s.current}
                  className="ml-4 p-2 rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label="Revoke session"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-4 flex flex-col items-end gap-1">
        <button
          onClick={handleLogoutEverywhere}
          disabled={logoutEverywhere.isPending}
          className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 disabled:opacity-50"
        >
          <LogOut className="w-4 h-4" />
          {logoutEverywhere.isPending ? 'Signing out…' : 'Log out everywhere'}
        </button>
        <p className="text-[11px] text-slate-600">
          Other devices will be signed out within an hour.
        </p>
      </div>
    </section>
  );
};

// ---------------------------------------------------------------------------
// Modal shell
// ---------------------------------------------------------------------------

const ModalShell: React.FC<{
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
    <div className="absolute inset-0 bg-bg/85 backdrop-blur-md" onClick={onClose} />
    <div
      className="relative w-full max-w-md sm:max-h-[90vh] rounded-t-2xl sm:rounded-2xl bg-surface border border-white/10 shadow-2xl overflow-hidden"
      role="dialog"
      aria-modal="true"
    >
      <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
        <h3 className="text-base font-semibold text-white">{title}</h3>
        <button
          onClick={onClose}
          className="text-slate-500 hover:text-slate-300 text-sm"
          aria-label="Close"
        >
          ✕
        </button>
      </div>
      <div className="p-5">{children}</div>
    </div>
  </div>
);

export default SettingsPage;
