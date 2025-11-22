import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LogIn } from 'lucide-react';

export const Login: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
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
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h1 className="auth-title">Welcome Back</h1>
        <p className="auth-subtitle">Sign in to manage your expenses</p>

        {error && (
          <div style={{ color: 'var(--error)', marginBottom: '1rem', textAlign: 'center' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <label className="input-label">Username</label>
            <input
              type="text"
              className="input-field"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>

          <div className="input-group">
            <label className="input-label">Password</label>
            <input
              type="password"
              className="input-field"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>
            <LogIn size={20} style={{ marginRight: '0.5rem' }} />
            Sign In
          </button>
        </form>

        <p style={{ marginTop: '1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          Don't have an account? <Link to="/register" className="link">Sign up</Link>
        </p>
      </div>
    </div>
  );
};
