import { useMutation, useQuery } from '@tanstack/react-query';
import { apiJson, postJson } from '../lib/api';
import { tzOffsetMinutes } from '../lib/format';
import { queryClient } from '../lib/queryClient';
import type {
  Expense,
  ExpenseSummary,
  ImageRecord,
  TimelineDay,
  Trip,
  TripDetail,
  User,
} from '../types';

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

export function useExpenses() {
  return useQuery({ queryKey: ['expenses'], queryFn: () => apiJson<Expense[]>('/api/expenses') });
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
