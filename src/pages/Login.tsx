import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { LogIn } from 'lucide-react';
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
    <div className="min-h-screen flex items-center justify-center p-4 login-mesh">
      {/* Subtle animated orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-violet-600/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-cyan-400/5 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-[380px] animate-scale-in">
        {/* Glass card */}
        <div className="bg-[#1e293b]/80 backdrop-blur-xl rounded-2xl p-8
          border border-white/10 shadow-[0_32px_80px_rgba(0,0,0,0.5)]">

          {/* Brand mark */}
          <div className="flex justify-center mb-6">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-500
              flex items-center justify-center shadow-xl shadow-violet-600/30">
              <img src="/icon-192.png" alt="Money Hater" className="w-9 h-9" />
            </div>
          </div>

          <h1 className="text-2xl font-bold text-center text-white mb-1">
            Welcome back
          </h1>
          <p className="text-slate-400 text-center text-sm mb-6">
            Sign in to manage your finances
          </p>

          {error && (
            <div className="mb-4 text-rose-400 text-center text-sm
              bg-rose-500/10 border border-rose-500/20 p-3 rounded-xl">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="login-username"
                className="block mb-1.5 text-slate-300 text-xs font-medium"
              >
                Username
              </label>
              <input
                id="login-username"
                type="text"
                autoComplete="username"
                className="w-full px-4 py-3 rounded-xl
                  bg-white/5 border border-white/10 text-white placeholder-slate-500
                  outline-none transition-all
                  focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
                placeholder="Enter your username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>

            <div>
              <label
                htmlFor="login-password"
                className="block mb-1.5 text-slate-300 text-xs font-medium"
              >
                Password
              </label>
              <input
                id="login-password"
                type="password"
                autoComplete="current-password"
                className="w-full px-4 py-3 rounded-xl
                  bg-white/5 border border-white/10 text-white placeholder-slate-500
                  outline-none transition-all
                  focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <div className="text-right mt-1.5">
                <Link
                  to="/forgot-password"
                  className="text-xs text-violet-400 hover:text-violet-300 transition-colors"
                >
                  Forgot password?
                </Link>
              </div>
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
              className="inline-flex items-center justify-center w-full px-4 py-3
                text-sm rounded-xl font-semibold cursor-pointer transition-all border-none outline-none
                bg-gradient-to-r from-violet-600 to-indigo-500
                hover:from-violet-500 hover:to-indigo-400
                text-white shadow-lg shadow-violet-600/25
                disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                  Signing in...
                </>
              ) : (
                <>
                  <LogIn size={16} className="mr-2" />
                  Sign In
                </>
              )}
            </button>
          </form>

          {/* <p className="mt-4 text-center text-slate-500 text-xs">
            Don't have an account?{' '}
            <Link to="/register" className="text-violet-400 hover:text-violet-300 transition-colors font-medium">
              Sign up
            </Link>
          </p> */}
        </div>
      </div>
    </div>
  );
};
