import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { ApiError, apiJson, postJson } from '../lib/api';
import { queryClient } from '../lib/queryClient';
import type { User } from '../types';

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string, turnstileToken?: string) => Promise<void>;
  register: (email: string, password: string, turnstileToken?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      setUser(await apiJson<User>('/api/auth/me'));
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) setUser(null);
    }
  }, []);

  useEffect(() => {
    refreshUser().finally(() => setLoading(false));
  }, [refreshUser]);

  const login = useCallback(async (email: string, password: string, turnstileToken?: string) => {
    setUser(
      await postJson<User>('/api/auth/login', {
        email,
        password,
        turnstile_token: turnstileToken ?? null,
      }),
    );
  }, []);

  const register = useCallback(
    async (email: string, password: string, turnstileToken?: string) => {
      setUser(
        await postJson<User>('/api/auth/register', {
          email,
          password,
          turnstile_token: turnstileToken ?? null,
        }),
      );
    },
    [],
  );

  const logout = useCallback(async () => {
    await postJson('/api/auth/logout', {});
    queryClient.clear();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}
