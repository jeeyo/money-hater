import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Lock, CheckCircle } from 'lucide-react';

export const SetPassword: React.FC = () => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();
  const { login } = useAuth();

  useEffect(() => {
    if (!token) {
      setError('Invalid or missing registration token.');
    }
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 10 || !/[A-Za-z]/.test(password) || !/[0-9!@#$%^&*()_\-+=[\]{};:'",.<>/?\\|`~]/.test(password)) {
      setError('Password must be at least 10 characters and include a letter and a number or symbol.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (!token) {
      setError('Missing registration token');
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/auth/complete-registration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to set password' }));
        throw new Error(errorData.error || 'Failed to set password');
      }

      const data = await response.json();
      login(data);
      navigate('/');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to set password');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50 dark:bg-slate-900">
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl w-full max-w-[380px] shadow-sm border border-slate-200 dark:border-slate-700 text-center">
          <div className="text-red-500 mb-4">
            <Lock size={32} className="mx-auto" />
          </div>
          <h1 className="text-xl font-semibold mb-2 text-slate-900 dark:text-white">Invalid Link</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">
            This registration link is invalid or has expired.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50 dark:bg-slate-900">
      <div className="bg-white dark:bg-slate-800 p-6 rounded-xl w-full max-w-[380px] shadow-sm border border-slate-200 dark:border-slate-700">
        <h1 className="text-2xl font-semibold mb-1 text-center text-slate-900 dark:text-white">Set Password</h1>
        <p className="text-slate-500 dark:text-slate-400 text-center text-sm mb-6">At least 10 characters, including a letter and a number or symbol.</p>

        {error && (
          <div className="text-red-600 dark:text-red-400 mb-4 text-center text-sm bg-red-50 dark:bg-red-900/20 p-2 rounded-lg">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-3">
            <label htmlFor="set-password" className="block mb-1.5 text-slate-600 dark:text-slate-400 text-xs font-medium">Password</label>
            <input
              id="set-password"
              type="password"
              autoComplete="new-password"
              className="w-full px-3 py-2 text-sm rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-50 transition-colors focus:border-indigo-400 dark:focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-400 dark:focus:ring-indigo-500"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={10}
            />
          </div>

          <div className="mb-6">
            <label htmlFor="set-password-confirm" className="block mb-1.5 text-slate-600 dark:text-slate-400 text-xs font-medium">Confirm Password</label>
            <input
              id="set-password-confirm"
              type="password"
              autoComplete="new-password"
              className="w-full px-3 py-2 text-sm rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-50 transition-colors focus:border-indigo-400 dark:focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-400 dark:focus:ring-indigo-500"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={10}
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center justify-center px-4 py-2 text-sm rounded-lg font-medium cursor-pointer transition-all border-none outline-none bg-indigo-600 dark:bg-indigo-500 text-white hover:bg-indigo-700 dark:hover:bg-indigo-600 w-full disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                Creating Account...
              </>
            ) : (
              <>
                <CheckCircle size={16} className="mr-2" />
                Complete Registration
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
