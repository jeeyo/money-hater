import { createContext } from 'react';
import type { User, AuthResponse } from '../types';

export interface AuthContextType {
  user: User | null;
  login: (data: AuthResponse) => void;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
  isLoading: boolean;
}

// The access JWT is now in an HttpOnly cookie. There is no longer a token
// available to JavaScript — `apiFetch` relies on the browser sending cookies
// automatically.
export const AuthContext = createContext<AuthContextType | undefined>(undefined);
export type { AuthResponse };
