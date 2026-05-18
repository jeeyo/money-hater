import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { ArrowRight } from 'lucide-react';
import { Turnstile } from '@marsidev/react-turnstile';
import { getTurnstileSiteKey } from '../services/turnstile';

export const Login: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, turnstileToken }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to login' }));
        throw new Error(errorData.error || 'Failed to login');
      }

      const data = await response.json();
      login(data);
      navigate('/');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to login');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center p-4 login-grid overflow-hidden">
      {/* Floating ambient orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-80 h-80 rounded-full bg-amber-500/6 blur-3xl animate-breathe" />
        <div
          className="absolute bottom-1/4 right-1/4 w-64 h-64 rounded-full bg-teal-500/5 blur-3xl animate-breathe"
          style={{ animationDelay: '2s' }}
        />
        <div
          className="absolute top-3/4 left-1/2 w-48 h-48 rounded-full bg-amber-400/4 blur-2xl animate-breathe"
          style={{ animationDelay: '1s' }}
        />
      </div>

      <div className="relative w-full max-w-[400px] animate-scale-in">
        {/* Card with rotating glow border */}
        <div
          className="glow-border rounded-2xl p-8 sm:p-10"
          style={{
            background: 'linear-gradient(145deg, #0f1929 0%, #0b1120 100%)',
            boxShadow: '0 40px 100px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04)',
          }}
        >
          {/* Brand */}
          <div className="flex flex-col items-center mb-8">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4 shadow-xl shadow-amber-500/25 animate-float"
              style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' }}
            >
              <img src="/icon-192.png" alt="Money Hater" className="w-10 h-10" />
            </div>
            <h1 className="font-display font-bold text-3xl text-white tracking-tight">
              Money Hater
            </h1>
            <p className="text-slate-600 text-sm mt-1.5 text-center">
              Master your finances. Own your future.
            </p>
          </div>

          {/* Error */}
          {error && (
            <div
              className="mb-5 text-rose-400 text-sm text-center
              bg-rose-500/8 border border-rose-500/20 p-3.5 rounded-xl animate-fade-in-up"
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Username */}
            <div className="space-y-1.5">
              <label htmlFor="login-username" className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Username
              </label>
              <input
                id="login-username"
                type="text"
                autoComplete="username"
                className="w-full px-4 py-3 rounded-xl text-sm
                  text-white placeholder-slate-700
                  outline-none transition-all duration-200
                  focus:ring-2"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                } as any}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(245,158,11,0.5)';
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(245,158,11,0.1)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
                placeholder="your_username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="login-password" className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Password
                </label>
                <Link
                  to="/forgot-password"
                  className="text-xs text-amber-500 hover:text-amber-400 transition-colors"
                >
                  Forgot password?
                </Link>
              </div>
              <input
                id="login-password"
                type="password"
                autoComplete="current-password"
                className="w-full px-4 py-3 rounded-xl text-sm
                  text-white placeholder-slate-700
                  outline-none transition-all duration-200"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.07)',
                } as React.CSSProperties}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(245,158,11,0.5)';
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(245,158,11,0.1)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
                placeholder="••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <div className="flex justify-center pt-1">
              <Turnstile
                siteKey={getTurnstileSiteKey()}
                onSuccess={(token) => setTurnstileToken(token)}
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="relative w-full py-3.5 rounded-xl text-sm font-bold text-bg
                transition-all duration-200 overflow-hidden
                disabled:opacity-50 disabled:cursor-not-allowed
                btn-amber mt-2"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-bg/30 border-t-bg rounded-full animate-spin" />
                  Signing in...
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  Sign In
                  <ArrowRight className="w-4 h-4" />
                </span>
              )}
            </button>
          </form>

          {/* Divider line */}
          <div className="mt-8 pt-6 border-t border-white/5 text-center">
            <p className="text-[11px] text-slate-700">
              Secure login · End-to-end encrypted
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
