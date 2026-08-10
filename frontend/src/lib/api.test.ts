import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiFetch } from './api';

/** A fetch that 401s until the refresh endpoint has been called. */
function sessionFetch({ refreshWorks = true } = {}) {
  let refreshed = false;
  return vi.fn(async (path: string) => {
    if (path === '/api/auth/refresh') {
      refreshed = refreshWorks;
      return new Response(null, { status: refreshWorks ? 200 : 401 });
    }
    return refreshed
      ? new Response(JSON.stringify({ id: 1 }), { status: 200 })
      : new Response(JSON.stringify({ detail: 'Not authenticated' }), { status: 401 });
  });
}

describe('apiFetch', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', sessionFetch());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('refreshes an expired session when checking who is signed in', async () => {
    // The access cookie lasts an hour and the refresh cookie a month: reopening
    // the app the next day has to renew the session rather than sign you out.
    const response = await apiFetch('/api/auth/me');
    expect(response.status).toBe(200);
    expect(vi.mocked(fetch).mock.calls.map((call) => call[0])).toEqual([
      '/api/auth/me',
      '/api/auth/refresh',
      '/api/auth/me',
    ]);
  });

  it('refreshes for an ordinary endpoint too, query string and all', async () => {
    const response = await apiFetch('/api/timeline?date=2026-08-10');
    expect(response.status).toBe(200);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(3);
  });

  it('does not try to refresh a rejected sign-in', async () => {
    vi.stubGlobal('fetch', sessionFetch({ refreshWorks: false }));
    await expect(apiFetch('/api/auth/login', { method: 'POST' })).rejects.toThrow(ApiError);
    expect(vi.mocked(fetch).mock.calls.map((call) => call[0])).toEqual(['/api/auth/login']);
  });

  it('gives up once the refresh itself fails', async () => {
    vi.stubGlobal('fetch', sessionFetch({ refreshWorks: false }));
    await expect(apiFetch('/api/auth/me')).rejects.toMatchObject({
      status: 401,
      message: 'Not authenticated',
    });
  });
});
