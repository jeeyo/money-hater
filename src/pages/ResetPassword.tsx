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
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-slate-800 p-8 rounded-2xl w-full max-w-[400px] shadow-2xl border border-slate-700">
          <h1 className="text-3xl font-bold mb-2 text-center">Invalid Link</h1>
          <p className="mt-6 text-center text-slate-400">
            <Link to="/login" className="text-indigo-500 no-underline hover:underline">Back to Login</Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="bg-slate-800 p-8 rounded-2xl w-full max-w-[400px] shadow-2xl border border-slate-700">
        <h1 className="text-3xl font-bold mb-2 text-center">Reset Password</h1>
        <p className="text-slate-400 text-center mb-8">Enter your new password</p>

        {error && (
          <div className="text-red-500 mb-4 text-center">
            {error}
          </div>
        )}

        {message && (
          <div className="text-green-500 mb-4 text-center">
            {message}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block mb-2 text-slate-400 text-sm">New Password</label>
            <input
              type="password"
              className="w-full p-3 rounded-lg bg-slate-800 border border-slate-700 text-slate-50 transition-colors focus:border-indigo-500 focus:outline-none"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>

          <div className="mb-4">
            <label className="block mb-2 text-slate-400 text-sm">Confirm Password</label>
            <input
              type="password"
              className="w-full p-3 rounded-lg bg-slate-800 border border-slate-700 text-slate-50 transition-colors focus:border-indigo-500 focus:outline-none"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>

          <button type="submit" className="inline-flex items-center justify-center px-6 py-3 rounded-lg font-medium cursor-pointer transition-all border-none outline-none bg-indigo-500 text-white hover:bg-indigo-600 w-full">
            <Lock size={20} className="mr-2" />
            Reset Password
          </button>
        </form>

        <p className="mt-6 text-center text-slate-400">
          <Link to="/login" className="text-indigo-500 no-underline hover:underline">Back to Login</Link>
        </p>
      </div>
    </div>
  );
};
