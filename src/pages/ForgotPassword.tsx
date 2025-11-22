import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail } from 'lucide-react';

export const ForgotPassword: React.FC = () => {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [debugLink, setDebugLink] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setDebugLink('');

    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
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
    <div className="auth-container">
      <div className="auth-card">
        <h1 className="auth-title">Forgot Password</h1>
        <p className="auth-subtitle">Enter your email to reset your password</p>

        {error && (
          <div style={{ color: 'var(--error)', marginBottom: '1rem', textAlign: 'center' }}>
            {error}
          </div>
        )}

        {message && (
          <div style={{ color: 'var(--success)', marginBottom: '1rem', textAlign: 'center' }}>
            {message}
          </div>
        )}

        {debugLink && (
          <div style={{ marginTop: '1rem', padding: '1rem', background: '#333', color: '#fff', borderRadius: '4px', wordBreak: 'break-all', fontSize: '0.8rem' }}>
            <strong>Debug Link (Dev Only):</strong><br />
            <a href={debugLink} style={{ color: '#4da6ff' }}>{debugLink}</a>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <label className="input-label">Email</label>
            <input
              type="email"
              className="input-field"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>
            <Mail size={20} style={{ marginRight: '0.5rem' }} />
            Send Reset Link
          </button>
        </form>

        <p style={{ marginTop: '1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          Remember your password? <Link to="/login" className="link">Sign in</Link>
        </p>
      </div>
    </div>
  );
};
