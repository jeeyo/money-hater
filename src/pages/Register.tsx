import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { UserPlus } from 'lucide-react';

export const Register: React.FC = () => {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to register' }));
        throw new Error(errorData.error || 'Failed to register');
      }

      const data = await response.json();
      login(data);
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Failed to register');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="bg-slate-800 p-8 rounded-2xl w-full max-w-[400px] shadow-2xl border border-slate-700">
        <h1 className="text-3xl font-bold mb-2 text-center">Create Account</h1>
        <p className="text-slate-400 text-center mb-8">Start tracking your money today</p>

        {error && (
          <div className="text-red-500 mb-4 text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block mb-2 text-slate-400 text-sm">Username</label>
            <input
              type="text"
              className="w-full p-3 rounded-lg bg-slate-800 border border-slate-700 text-slate-50 transition-colors focus:border-indigo-500 focus:outline-none"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>

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

          <div className="mb-4">
            <label className="block mb-2 text-slate-400 text-sm">Password</label>
            <input
              type="password"
              className="w-full p-3 rounded-lg bg-slate-800 border border-slate-700 text-slate-50 transition-colors focus:border-indigo-500 focus:outline-none"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button type="submit" className="inline-flex items-center justify-center px-6 py-3 rounded-lg font-medium cursor-pointer transition-all border-none outline-none bg-indigo-500 text-white hover:bg-indigo-600 w-full">
            <UserPlus size={20} className="mr-2" />
            Sign Up
          </button>
        </form>

        <p className="mt-6 text-center text-slate-400">
          Already have an account? <Link to="/login" className="text-indigo-500 no-underline hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
};
