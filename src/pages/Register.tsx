import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { UserPlus } from 'lucide-react';
import { Turnstile } from '@marsidev/react-turnstile';
import { getTurnstileSiteKey } from '../services/turnstile';

export const Register: React.FC = () => {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');

  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [debugLink, setDebugLink] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [isLoading, setIsLoading] = useState(false);


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, turnstileToken }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to register' }));
        throw new Error(errorData.error || 'Failed to register');
      }

      const data = await response.json();
      setSuccess(true);
      if (data.debug_link) {
        setDebugLink(data.debug_link);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to register');
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50 dark:bg-slate-900">
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl w-full max-w-[380px] shadow-sm border border-slate-200 dark:border-slate-700">
          <div className="text-center">
            <div className="mb-4 text-green-500 bg-green-50 dark:bg-green-900/20 p-3 rounded-full inline-block">
              <UserPlus size={32} />
            </div>
            <h1 className="text-2xl font-semibold mb-2 text-slate-900 dark:text-white">Check your email</h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">
              We've sent a verification link to <strong>{email}</strong>. Please check your inbox to complete your registration.
            </p>
            {debugLink && (
              <div className="mb-6 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg text-left">
                <p className="text-xs text-yellow-800 dark:text-yellow-200 font-medium mb-1">DEV MODE:</p>
                <a href={debugLink} className="text-xs text-indigo-600 dark:text-indigo-400 break-all hover:underline">
                  {debugLink}
                </a>
              </div>
            )}
            <Link to="/login" className="text-indigo-600 dark:text-indigo-400 text-sm hover:underline font-medium">
              Back to Sign In
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50 dark:bg-slate-900">
      <div className="bg-white dark:bg-slate-800 p-6 rounded-xl w-full max-w-[380px] shadow-sm border border-slate-200 dark:border-slate-700">
        <h1 className="text-2xl font-semibold mb-1 text-center text-slate-900 dark:text-white">Create Account</h1>
        <p className="text-slate-500 dark:text-slate-400 text-center text-sm mb-6">Start tracking your money today</p>

        {error && (
          <div className="text-red-600 dark:text-red-400 mb-4 text-center text-sm bg-red-50 dark:bg-red-900/20 p-2 rounded-lg">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-3">
            <label htmlFor="register-username" className="block mb-1.5 text-slate-600 dark:text-slate-400 text-xs font-medium">Username</label>
            <input
              id="register-username"
              type="text"
              autoComplete="username"
              className="w-full px-3 py-2 text-sm rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-50 transition-colors focus:border-indigo-400 dark:focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-400 dark:focus:ring-indigo-500"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>

          <div className="mb-3">
            <label htmlFor="register-email" className="block mb-1.5 text-slate-600 dark:text-slate-400 text-xs font-medium">Email</label>
            <input
              id="register-email"
              type="email"
              autoComplete="email"
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
                <UserPlus size={16} className="mr-2" />
                Send Verification Link
              </>
            )}
          </button>
        </form>

        <p className="mt-4 text-center text-slate-500 dark:text-slate-400 text-xs">
          Already have an account? <Link to="/login" className="text-indigo-600 dark:text-indigo-400 no-underline hover:underline font-medium">Sign in</Link>
        </p>
      </div>
    </div>
  );
};
