import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { apiJson, postJson } from '../lib/api';
import { tzOffsetMinutes } from '../lib/format';
import { queryClient } from '../lib/queryClient';
import type {
  Expense,
  ExpenseSummary,
  ImageRecord,
  PlaceDetails,
  RateQuote,
  TimelineDay,
  Trip,
  TripDetail,
  TripRecommendations,
  User,
} from '../types';

export interface ExpenseInput {
  total?: number;
  currency?: string;
  description?: string | null;
  merchant?: string | null;
  place_id?: number | null;
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
  return useQuery({
    queryKey: ['trips'],
    queryFn: () => apiJson<Trip[]>(`/api/trips?tz_offset_minutes=${tzOffsetMinutes()}`),
  });
}

export function useTrip(tripId: number) {
  return useQuery({
    queryKey: ['trips', tripId],
    queryFn: () =>
      apiJson<TripDetail>(`/api/trips/${tripId}?tz_offset_minutes=${tzOffsetMinutes()}`),
  });
}

export function useCreateTrip() {
  return useMutation({
    // A null end starts a trip you are still on: it runs to today and grows.
    mutationFn: (body: {
      title: string;
      start_expense_id: number;
      end_expense_id: number | null;
    }) => postJson<TripDetail>(`/api/trips?tz_offset_minutes=${tzOffsetMinutes()}`, body),
    onSuccess: invalidateItinerary,
  });
}

/** Close an open trip. Without an expense the server ends it at the latest one. */
export function useEndTrip(tripId: number) {
  return useMutation({
    mutationFn: (body: { end_expense_id?: number } = {}) =>
      postJson<TripDetail>(
        `/api/trips/${tripId}/end?tz_offset_minutes=${tzOffsetMinutes()}`,
        body,
      ),
    onSuccess: invalidateItinerary,
  });
}

/** Cached suggestions for an open trip. Polls only while a run is in flight. */
export function useRecommendations(tripId: number, enabled = true) {
  return useQuery({
    queryKey: ['trips', tripId, 'recommendations'],
    queryFn: () =>
      apiJson<TripRecommendations>(
        `/api/trips/${tripId}/recommendations?tz_offset_minutes=${tzOffsetMinutes()}`,
      ),
    enabled,
    refetchInterval: (query) => (query.state.data?.status === 'pending' ? 2000 : false),
  });
}

export function useGenerateRecommendations(tripId: number) {
  return useMutation({
    mutationFn: (body: { refresh?: boolean } = {}) =>
      postJson<TripRecommendations>(
        `/api/trips/${tripId}/recommendations?tz_offset_minutes=${tzOffsetMinutes()}`,
        body,
      ),
    onSuccess: (data) => {
      // Seed the cache so the pending state (and its polling) starts at once
      queryClient.setQueryData(['trips', tripId, 'recommendations'], data);
    },
  });
}

/** Ratings, hours and comments — fetched only when a card is opened. */
export function usePlaceDetails(googlePlaceId: string | null) {
  return useQuery({
    queryKey: ['places', googlePlaceId],
    queryFn: () => apiJson<PlaceDetails>(`/api/places/${googlePlaceId}/details`),
    enabled: googlePlaceId != null,
    staleTime: 60 * 60 * 1000,
  });
}

export function useDeleteTrip() {
  return useMutation({
    mutationFn: (tripId: number) => apiJson<void>(`/api/trips/${tripId}`, { method: 'DELETE' }),
    onSuccess: invalidateItinerary,
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

export interface UploadOutcome {
  name: string;
  status: 'added' | 'duplicate' | 'failed';
  /** Why it failed, as a value rather than a message to match on */
  code?: 'no_location' | 'too_large' | 'not_an_image' | 'error';
  image?: ImageRecord;
  error?: string;
}

function codeFor(httpStatus: number): UploadOutcome['code'] {
  if (httpStatus === 422) return 'no_location';
  if (httpStatus === 413) return 'too_large';
  if (httpStatus === 415) return 'not_an_image';
  return 'error';
}

/** How many photos go up at once. Phone uploads are slow and phone photos are
 *  big; three keeps the link busy without stalling on a bad connection. */
const UPLOAD_CONCURRENCY = 3;

async function uploadOne(file: File): Promise<UploadOutcome> {
  const form = new FormData();
  form.append('files', file);
  let code: UploadOutcome['code'];
  try {
    const response = await fetch('/api/images', { method: 'POST', body: form });
    if (!response.ok) {
      code = codeFor(response.status);
      const body = await response.json().catch(() => null);
      throw new Error(body?.detail ?? response.statusText);
    }
    const created = (await response.json()) as ImageRecord[];
    // An empty list means the server already had this exact photo
    return created.length
      ? { name: file.name, status: 'added', image: created[0] }
      : { name: file.name, status: 'duplicate' };
  } catch (error) {
    return {
      name: file.name,
      status: 'failed',
      code: code ?? 'error',
      error: (error as Error).message,
    };
  }
}

/**
 * Upload a selection one photo at a time, a few in flight at once.
 *
 * One request per photo rather than one for the batch: picking twenty photos
 * out of a gallery and having the whole lot rejected because one of them is a
 * 30MB panorama is the wrong failure. This way each photo succeeds, is skipped
 * as a duplicate, or fails on its own, and the page can say which.
 */
export function useUploadImages() {
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  const mutation = useMutation({
    mutationFn: async (files: File[]) => {
      setProgress({ done: 0, total: files.length });
      const outcomes: UploadOutcome[] = new Array(files.length);
      let next = 0;
      let done = 0;

      async function worker() {
        while (next < files.length) {
          const index = next++;
          outcomes[index] = await uploadOne(files[index]);
          done += 1;
          setProgress({ done, total: files.length });
        }
      }

      await Promise.all(
        Array.from({ length: Math.min(UPLOAD_CONCURRENCY, files.length) }, worker),
      );
      return outcomes;
    },
    onSuccess: invalidateItinerary,
  });

  return { ...mutation, progress };
}

export function useUpdateTrip(tripId: number) {
  return useMutation({
    // An explicit null end reopens the trip; leaving it out keeps it as it is.
    mutationFn: (body: {
      title?: string;
      start_expense_id?: number;
      end_expense_id?: number | null;
    }) =>
      postJson<TripDetail>(
        `/api/trips/${tripId}?tz_offset_minutes=${tzOffsetMinutes()}`,
        body,
        'PATCH',
      ),
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
