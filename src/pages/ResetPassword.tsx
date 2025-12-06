import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Lock } from 'lucide-react';

export const ResetPassword: React.FC = () => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (!token) {
      setError('Invalid reset token');
      return;
    }

    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to reset password');
      }

      setMessage(data.message);
      setTimeout(() => navigate('/login'), 2000);
    } catch (err: any) {
      setError(err.message || 'Failed to reset password');
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50 dark:bg-slate-900">
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl w-full max-w-[380px] shadow-sm border border-slate-200 dark:border-slate-700">
          <h1 className="text-2xl font-semibold mb-2 text-center text-slate-900 dark:text-white">Invalid Link</h1>
          <p className="mt-4 text-center text-slate-500 dark:text-slate-400 text-xs">
            <Link to="/login" className="text-indigo-600 dark:text-indigo-400 no-underline hover:underline font-medium">Back to Login</Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50 dark:bg-slate-900">
      <div className="bg-white dark:bg-slate-800 p-6 rounded-xl w-full max-w-[380px] shadow-sm border border-slate-200 dark:border-slate-700">
        <h1 className="text-2xl font-semibold mb-1 text-center text-slate-900 dark:text-white">Reset Password</h1>
        <p className="text-slate-500 dark:text-slate-400 text-center text-sm mb-6">Enter your new password</p>

        {error && (
          <div className="text-red-600 dark:text-red-400 mb-4 text-center text-sm bg-red-50 dark:bg-red-900/20 p-2 rounded-lg">
            {error}
          </div>
        )}

        {message && (
          <div className="text-green-600 dark:text-green-400 mb-4 text-center text-sm bg-green-50 dark:bg-green-900/20 p-2 rounded-lg">
            {message}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-3">
            <label className="block mb-1.5 text-slate-600 dark:text-slate-400 text-xs font-medium">New Password</label>
            <input
              type="password"
              className="w-full px-3 py-2 text-sm rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-50 transition-colors focus:border-indigo-400 dark:focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-400 dark:focus:ring-indigo-500"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>

          <div className="mb-4">
            <label className="block mb-1.5 text-slate-600 dark:text-slate-400 text-xs font-medium">Confirm Password</label>
            <input
              type="password"
              className="w-full px-3 py-2 text-sm rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-50 transition-colors focus:border-indigo-400 dark:focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-400 dark:focus:ring-indigo-500"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>

          <button type="submit" className="inline-flex items-center justify-center px-4 py-2 text-sm rounded-lg font-medium cursor-pointer transition-all border-none outline-none bg-indigo-600 dark:bg-indigo-500 text-white hover:bg-indigo-700 dark:hover:bg-indigo-600 w-full">
            <Lock size={16} className="mr-2" />
            Reset Password
          </button>
        </form>

        <p className="mt-4 text-center text-slate-500 dark:text-slate-400 text-xs">
          <Link to="/login" className="text-indigo-600 dark:text-indigo-400 no-underline hover:underline font-medium">Back to Login</Link>
        </p>
      </div>
    </div>
  );
};
