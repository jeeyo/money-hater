import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
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
    } catch (err: any) {
      setError(err.message || 'Failed to login');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50 dark:bg-slate-900">
      <div className="bg-white dark:bg-slate-800 p-6 rounded-xl w-full max-w-[380px] shadow-sm border border-slate-200 dark:border-slate-700">
        <h1 className="text-2xl font-semibold mb-1 text-center text-slate-900 dark:text-white">Welcome Back</h1>
        <p className="text-slate-500 dark:text-slate-400 text-center text-sm mb-6">Sign in to manage your expenses</p>

        {error && (
          <div className="text-red-600 dark:text-red-400 mb-4 text-center text-sm bg-red-50 dark:bg-red-900/20 p-2 rounded-lg">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-3">
            <label className="block mb-1.5 text-slate-600 dark:text-slate-400 text-xs font-medium">Username</label>
            <input
              type="text"
              className="w-full px-3 py-2 text-sm rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-50 transition-colors focus:border-indigo-400 dark:focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-400 dark:focus:ring-indigo-500"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>

          <div className="mb-3">
            <label className="block mb-1.5 text-slate-600 dark:text-slate-400 text-xs font-medium">Password</label>
            <input
              type="password"
              className="w-full px-3 py-2 text-sm rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-50 transition-colors focus:border-indigo-400 dark:focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-400 dark:focus:ring-indigo-500"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <div className="text-right mt-1.5">
              <Link to="/forgot-password" className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300">
                Forgot Password?
              </Link>
            </div>
          </div>

          <div className="mb-4 flex justify-center">
            <Turnstile
              siteKey={getTurnstileSiteKey()}
              onSuccess={(token) => setTurnstileToken(token)}
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="inline-flex items-center justify-center px-4 py-2 text-sm rounded-lg font-medium cursor-pointer transition-all border-none outline-none bg-indigo-600 dark:bg-indigo-500 text-white hover:bg-indigo-700 dark:hover:bg-indigo-600 w-full disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                Signing In...
              </>
            ) : (
              <>
                <LogIn size={16} className="mr-2" />
                Sign In
              </>
            )}
          </button>
        </form>

        <p className="mt-4 text-center text-slate-500 dark:text-slate-400 text-xs">
          Don't have an account? <Link to="/register" className="text-indigo-600 dark:text-indigo-400 no-underline hover:underline font-medium">Sign up</Link>
        </p>
      </div>
    </div>
  );
};
