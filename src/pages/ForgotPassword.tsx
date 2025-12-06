import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail } from 'lucide-react';
import { Turnstile } from '@marsidev/react-turnstile';
import { getTurnstileSiteKey } from '../services/turnstile';

export const ForgotPassword: React.FC = () => {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [debugLink, setDebugLink] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');

  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setDebugLink('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, turnstileToken }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send reset link');
      }

      setMessage(data.message);
      if (data.debug_link) {
        setDebugLink(data.debug_link);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to send reset link');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50 dark:bg-slate-900">
      <div className="bg-white dark:bg-slate-800 p-6 rounded-xl w-full max-w-[380px] shadow-sm border border-slate-200 dark:border-slate-700">
        <h1 className="text-2xl font-semibold mb-1 text-center text-slate-900 dark:text-white">Forgot Password</h1>
        <p className="text-slate-500 dark:text-slate-400 text-center text-sm mb-6">Enter your email to reset your password</p>

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

        {debugLink && (
          <div className="mt-3 p-3 bg-slate-100 dark:bg-slate-900 text-slate-900 dark:text-white rounded-lg text-xs break-all border border-slate-200 dark:border-slate-700">
            <strong>Debug Link (Dev Only):</strong><br />
            <a href={debugLink} className="text-indigo-600 dark:text-indigo-400 hover:underline">{debugLink}</a>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-3">
            <label className="block mb-1.5 text-slate-600 dark:text-slate-400 text-xs font-medium">Email</label>
            <input
              type="email"
              className="w-full px-3 py-2 text-sm rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-50 transition-colors focus:border-indigo-400 dark:focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-400 dark:focus:ring-indigo-500"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
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
                Sending...
              </>
            ) : (
              <>
                <Mail size={16} className="mr-2" />
                Send Reset Link
              </>
            )}
          </button>
        </form>

        <p className="mt-4 text-center text-slate-500 dark:text-slate-400 text-xs">
          Remember your password? <Link to="/login" className="text-indigo-600 dark:text-indigo-400 no-underline hover:underline font-medium">Sign in</Link>
        </p>
      </div>
    </div>
  );
};
