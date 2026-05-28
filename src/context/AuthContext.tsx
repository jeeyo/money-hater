import React, { useEffect, useState } from 'react';
import type { User, AuthResponse } from '../types';
import { AuthContext } from './authContextValue';
import { apiFetch, fetchMe } from '../services/api';

const readCachedUser = (): User | null => {
  const raw = localStorage.getItem('user');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Optimistic render from the localStorage cache while we verify the cookie
  // with the server. The cookie is the source of truth; `user` here is a UX
  // cache so the app shell doesn't flash signed-out content on every reload.
  const [user, setUser] = useState<User | null>(readCachedUser);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const verified = await fetchMe();
      if (cancelled) return;
      if (verified) {
        setUser(verified);
        localStorage.setItem('user', JSON.stringify(verified));
      } else {
        setUser(null);
        localStorage.removeItem('user');
      }
      setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = (data: AuthResponse) => {
    setUser(data.user);
    localStorage.setItem('user', JSON.stringify(data.user));
  };

  const logout = async () => {
    // skipRefresh: if the refresh cookie is already expired we don't want
    // apiFetch to loop into a redirect mid-logout. Worst case the server
    // never hears about it, but our local state is cleared either way.
    try {
      await apiFetch('/api/auth/logout', { method: 'POST', skipRefresh: true });
    } catch {
      /* ignore — clearing local state is what matters */
    }
    setUser(null);
    localStorage.removeItem('user');
    if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
      window.location.href = '/login';
    }
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isAuthenticated: !!user, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};
