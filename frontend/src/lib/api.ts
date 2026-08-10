/** Cookie-based API client: on 401 it tries one refresh, then retries once. */

/**
 * Endpoints whose 401 is the answer, not a stale access token.
 *
 * Everything else — `/api/auth/me` very much included — is worth one refresh
 * first. The access cookie lasts an hour and the refresh cookie thirty days,
 * so a session that skips the refresh on `me` is a session that ends an hour
 * after you sign in: open the app the next morning, `me` 401s, and the app
 * shows the login form while a perfectly good refresh token sits in the jar.
 */
const NO_REFRESH_ON_401 = new Set([
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/logout',
  '/api/auth/refresh',
]);

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

let refreshPromise: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  refreshPromise ??= fetch('/api/auth/refresh', { method: 'POST' })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  let response = await fetch(path, init);
  if (response.status === 401 && !NO_REFRESH_ON_401.has(path.split('?')[0])) {
    if (await tryRefresh()) {
      response = await fetch(path, init);
    }
  }
  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = await response.json();
      if (typeof body.detail === 'string') detail = body.detail;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(response.status, detail);
  }
  return response;
}

export async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(path, init);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function postJson<T>(path: string, body: unknown, method = 'POST'): Promise<T> {
  return apiJson<T>(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
