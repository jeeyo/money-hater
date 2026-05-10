import { QueryClient, QueryCache, MutationCache } from '@tanstack/react-query';
import { showToast } from './toast';

function messageOf(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string') return error;
  return 'Something went wrong';
}

function toastError(error: unknown) {
  const msg = messageOf(error);
  // The api layer redirects on 401 by throwing 'Unauthorized'; suppress that
  // toast so users don't see "Unauthorized" right before being navigated away.
  if (msg === 'Unauthorized') return;
  showToast(msg, 'error');
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Treat data as fresh for 30s — enough to dedupe rapid navigation.
      staleTime: 30_000,
      // 5 min cache so revisited pages hydrate immediately while refetching.
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
  queryCache: new QueryCache({ onError: toastError }),
  mutationCache: new MutationCache({ onError: toastError }),
});
