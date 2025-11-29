import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail } from 'lucide-react';
import { Turnstile } from '@marsidev/react-turnstile';

export const ForgotPassword: React.FC = () => {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [debugLink, setDebugLink] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setDebugLink('');

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
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="bg-slate-800 p-8 rounded-2xl w-full max-w-[400px] shadow-2xl border border-slate-700">
        <h1 className="text-3xl font-bold mb-2 text-center">Forgot Password</h1>
        <p className="text-slate-400 text-center mb-8">Enter your email to reset your password</p>

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

        {debugLink && (
          <div className="mt-4 p-4 bg-gray-800 text-white rounded text-xs break-all">
            <strong>Debug Link (Dev Only):</strong><br />
            <a href={debugLink} className="text-blue-400">{debugLink}</a>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block mb-2 text-slate-400 text-sm">Email</label>
            <input
              type="email"
              className="w-full p-3 rounded-lg bg-slate-800 border border-slate-700 text-slate-50 transition-colors focus:border-indigo-500 focus:outline-none"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="mb-6 flex justify-center">
            <Turnstile
              siteKey="0x4AAAAAACDrTIQ7JEqrSBfd"
              onSuccess={(token) => setTurnstileToken(token)}
            />
          </div>

          <button type="submit" className="inline-flex items-center justify-center px-6 py-3 rounded-lg font-medium cursor-pointer transition-all border-none outline-none bg-indigo-500 text-white hover:bg-indigo-600 w-full">
            <Mail size={20} className="mr-2" />
            Send Reset Link
          </button>
        </form>

        <p className="mt-6 text-center text-slate-400">
          Remember your password? <Link to="/login" className="text-indigo-500 no-underline hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
};
