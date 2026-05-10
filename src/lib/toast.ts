/**
 * Singleton toast bus. Components subscribe via the ToastContainer; anywhere
 * in the app (including TanStack Query error handlers) can publish via
 * `showToast(message, type)`. Identical messages within DEDUP_WINDOW_MS are
 * deduplicated so failure storms don't spam the UI.
 */

import type { ToastType } from '../components/Toast';

export interface ToastEntry {
  id: string;
  message: string;
  type: ToastType;
  duration: number;
}

type Listener = (toasts: ToastEntry[]) => void;

const DEFAULT_DURATION_MS = 5000;
const DEDUP_WINDOW_MS = 3000;
const MAX_VISIBLE = 4;

let toasts: ToastEntry[] = [];
const listeners = new Set<Listener>();
const recent = new Map<string, number>();

function notify() {
  for (const fn of listeners) fn(toasts);
}

export function subscribeToasts(fn: Listener): () => void {
  listeners.add(fn);
  fn(toasts);
  return () => {
    listeners.delete(fn);
  };
}

export function showToast(message: string, type: ToastType = 'info', duration = DEFAULT_DURATION_MS): void {
  if (!message) return;
  const key = `${type}:${message}`;
  const now = Date.now();
  const last = recent.get(key);
  if (last && now - last < DEDUP_WINDOW_MS) return;
  recent.set(key, now);

  const id = (crypto as Crypto).randomUUID ? crypto.randomUUID() : String(now + Math.random());
  const entry: ToastEntry = { id, message, type, duration };
  toasts = [...toasts, entry].slice(-MAX_VISIBLE);
  notify();
}

export function dismissToast(id: string): void {
  toasts = toasts.filter((t) => t.id !== id);
  notify();
}
