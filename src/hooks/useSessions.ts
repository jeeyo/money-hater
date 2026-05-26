import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiJson } from '../services/api';

export interface SessionRow {
  id: string;
  name: string | null;
  userAgent: string | null;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  current: boolean;
}

const SESSIONS_KEY = ['sessions'] as const;

export function useSessions() {
  return useQuery<SessionRow[]>({
    queryKey: SESSIONS_KEY,
    queryFn: () => apiJson<SessionRow[]>('/api/auth/sessions'),
  });
}

export function useRevokeSession() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => apiJson<void>(`/api/auth/sessions/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: SESSIONS_KEY }),
  });
}

export function useLogoutEverywhere() {
  return useMutation<void, Error, void>({
    mutationFn: () => apiJson<void>('/api/auth/logout-everywhere', { method: 'POST' }),
  });
}
