import { describe, expect, it, beforeEach, vi } from 'vitest';
import { showToast, dismissToast, subscribeToasts } from '../toast';

beforeEach(() => {
  // Reset listener state between tests by subscribing+unsubscribing,
  // and by dismissing every leftover toast through the public API.
  let current: Array<{ id: string }> = [];
  const unsub = subscribeToasts((t) => {
    current = [...t];
  });
  for (const t of current) dismissToast(t.id);
  unsub();
  // Wait long enough for the dedup window to clear if a previous test
  // published the same message.
  vi.useFakeTimers?.();
});

describe('toast bus', () => {
  it('publishes to subscribers', () => {
    const seen: string[] = [];
    const unsub = subscribeToasts((toasts) => seen.push(toasts.map((t) => t.message).join('|')));

    showToast('hello', 'info');
    expect(seen.at(-1)).toContain('hello');

    unsub();
  });

  it('dedupes identical messages within the 3s window', () => {
    let last: number = 0;
    const unsub = subscribeToasts((toasts) => {
      last = toasts.length;
    });

    showToast('Network failed', 'error');
    showToast('Network failed', 'error');
    showToast('Network failed', 'error');
    // Only one toast should be visible despite three publish calls.
    expect(last).toBe(1);

    unsub();
  });

  it('caps simultaneous toasts to 4', () => {
    let last: number = 0;
    const unsub = subscribeToasts((toasts) => {
      last = toasts.length;
    });

    for (let i = 0; i < 8; i++) {
      // Different messages avoid the dedup window.
      showToast(`msg ${i}`, 'info');
    }
    expect(last).toBeLessThanOrEqual(4);

    unsub();
  });

  it('removes a toast on dismiss', () => {
    let toasts: Array<{ id: string; message: string }> = [];
    const unsub = subscribeToasts((t) => {
      toasts = [...t];
    });

    showToast('removable', 'info');
    const target = toasts.find((t) => t.message === 'removable');
    expect(target).toBeDefined();

    dismissToast(target!.id);
    expect(toasts.find((t) => t.id === target!.id)).toBeUndefined();

    unsub();
  });

  it('ignores empty messages', () => {
    let count = 0;
    const unsub = subscribeToasts((t) => {
      count = t.length;
    });
    const before = count;
    showToast('', 'info');
    expect(count).toBe(before);
    unsub();
  });
});
