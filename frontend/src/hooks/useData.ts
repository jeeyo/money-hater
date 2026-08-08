import { useMutation, useQuery } from '@tanstack/react-query';
import { apiJson, postJson } from '../lib/api';
import { tzOffsetMinutes } from '../lib/format';
import { queryClient } from '../lib/queryClient';
import type {
  Expense,
  ExpenseSummary,
  ImageRecord,
  RateQuote,
  TimelineDay,
  Trip,
  TripDetail,
  User,
} from '../types';

export interface ExpenseInput {
  total?: number;
  currency?: string;
  merchant?: string | null;
  spent_at?: string | null;
  note?: string | null;
  fx_rate?: number | null;
  items?: { name: string; qty: number; amount: number }[];
}

export function useTimeline(date: string) {
  return useQuery({
    queryKey: ['timeline', date],
    queryFn: () =>
      apiJson<TimelineDay>(`/api/timeline?date=${date}&tz_offset_minutes=${tzOffsetMinutes()}`),
  });
}

export function useTrips() {
  return useQuery({ queryKey: ['trips'], queryFn: () => apiJson<Trip[]>('/api/trips') });
}

export function useTrip(tripId: number) {
  return useQuery({
    queryKey: ['trips', tripId],
    queryFn: () => apiJson<TripDetail>(`/api/trips/${tripId}`),
  });
}

export function useExpenses(needsReview?: boolean) {
  const query = needsReview === undefined ? '' : `?needs_review=${needsReview}`;
  return useQuery({
    queryKey: ['expenses', 'list', needsReview ?? 'all'],
    queryFn: () => apiJson<Expense[]>(`/api/expenses${query}`),
  });
}

/** Today's rate into the base currency, used to prefill the confirmation UI. */
export function useRateQuote(fromCurrency: string, baseCurrency: string) {
  return useQuery({
    queryKey: ['rate', fromCurrency],
    queryFn: () => apiJson<RateQuote>(`/api/expenses/rate?from_currency=${fromCurrency}`),
    enabled: Boolean(fromCurrency) && fromCurrency !== baseCurrency,
    staleTime: 60 * 60 * 1000,
  });
}

export function useAddExpense() {
  return useMutation({
    mutationFn: (body: ExpenseInput) => postJson<Expense>('/api/expenses', body),
    onSuccess: invalidateItinerary,
  });
}

export function useConfirmExpense() {
  return useMutation({
    mutationFn: ({ id, fx_rate }: { id: number; fx_rate?: number }) =>
      postJson<Expense>(`/api/expenses/${id}/confirm`, fx_rate ? { fx_rate } : {}),
    onSuccess: invalidateItinerary,
  });
}

export function useUpdateExpense() {
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number } & Partial<ExpenseInput>) =>
      postJson<Expense>(`/api/expenses/${id}`, body, 'PATCH'),
    onSuccess: invalidateItinerary,
  });
}

export function useDeleteExpense() {
  return useMutation({
    mutationFn: (id: number) => apiJson<void>(`/api/expenses/${id}`, { method: 'DELETE' }),
    onSuccess: invalidateItinerary,
  });
}

export function useExpenseSummary() {
  return useQuery({
    queryKey: ['expenses', 'summary'],
    queryFn: () => apiJson<ExpenseSummary>('/api/expenses/summary'),
  });
}

export function useImage(imageId: number | null) {
  return useQuery({
    queryKey: ['images', imageId],
    queryFn: () => apiJson<ImageRecord>(`/api/images/${imageId}`),
    enabled: imageId != null,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'pending' || status === 'processing' ? 2000 : false;
    },
  });
}

function invalidateItinerary() {
  queryClient.invalidateQueries({ queryKey: ['timeline'] });
  queryClient.invalidateQueries({ queryKey: ['trips'] });
  queryClient.invalidateQueries({ queryKey: ['expenses'] });
}

export function useUploadImages() {
  return useMutation({
    mutationFn: async (files: File[]) => {
      const form = new FormData();
      for (const file of files) form.append('files', file);
      const response = await fetch('/api/images', { method: 'POST', body: form });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.detail ?? response.statusText);
      }
      return (await response.json()) as ImageRecord[];
    },
    onSuccess: invalidateItinerary,
  });
}

export function useUpdateTrip(tripId: number) {
  return useMutation({
    mutationFn: (body: { title?: string; kind?: string }) =>
      postJson<TripDetail>(`/api/trips/${tripId}`, body, 'PATCH'),
    onSuccess: invalidateItinerary,
  });
}

export function useUpdateSettings() {
  return useMutation({
    mutationFn: (body: Partial<User>) => postJson<User>('/api/auth/me', body, 'PATCH'),
  });
}

export function useReanalyzeImage() {
  return useMutation({
    mutationFn: (imageId: number) => postJson<ImageRecord>(`/api/images/${imageId}/reanalyze`, {}),
    onSuccess: invalidateItinerary,
  });
}

export function useDeleteImage() {
  return useMutation({
    mutationFn: (imageId: number) => apiJson<void>(`/api/images/${imageId}`, { method: 'DELETE' }),
    onSuccess: invalidateItinerary,
  });
}
