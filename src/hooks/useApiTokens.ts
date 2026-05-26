import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiJson } from '../services/api';

export interface ApiTokenRow {
  id: string;
  name: string;
  prefix: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface CreatedApiToken extends ApiTokenRow {
  /** The plaintext token. Only ever returned by the create response. */
  token: string;
}

export interface CreateApiTokenInput {
  name: string;
  expiresAt?: string;
}

const TOKENS_KEY = ['api-tokens'] as const;

export function useApiTokens() {
  return useQuery<ApiTokenRow[]>({
    queryKey: TOKENS_KEY,
    queryFn: () => apiJson<ApiTokenRow[]>('/api/api-tokens'),
  });
}

export function useCreateApiToken() {
  const qc = useQueryClient();
  return useMutation<CreatedApiToken, Error, CreateApiTokenInput>({
    mutationFn: (input) =>
      apiJson<CreatedApiToken>('/api/api-tokens', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: TOKENS_KEY }),
  });
}

export function useDeleteApiToken() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => apiJson<void>(`/api/api-tokens/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: TOKENS_KEY }),
  });
}
