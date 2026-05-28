import type { Expense, Budget, BudgetWithStats, User } from '../types';

const API_BASE = '/api/expenses';

// ---------------------------------------------------------------------------
// apiFetch — single auth-aware fetch wrapper.
//
// The access JWT and refresh token both live in HttpOnly cookies (the worker
// sets them at /api/auth/login). We send `credentials: 'include'` so the
// browser attaches them automatically; there is no JS-visible token.
//
// On a 401, we try `/api/auth/refresh` once (serialized via the module-level
// `refreshing` promise so concurrent 401s don't trigger a thundering herd of
// refresh calls). On success we retry the original request once with the
// fresh cookies. On failure we redirect to /login.
//
// Pass `{ skipRefresh: true }` to opt out — used by logout, which should
// never auto-redirect.
// ---------------------------------------------------------------------------

export interface ApiFetchOptions extends RequestInit {
  skipRefresh?: boolean;
}

let refreshing: Promise<boolean> | null = null;

async function attemptRefresh(): Promise<boolean> {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
      });
      return res.ok;
    } catch {
      return false;
    } finally {
      // Reset after the microtask so concurrent waiters all observe the
      // result of this attempt, not a stale singleton.
      setTimeout(() => {
        refreshing = null;
      }, 0);
    }
  })();
  return refreshing;
}

function redirectToLogin() {
  localStorage.removeItem('user');
  if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
    window.location.href = '/login';
  }
}

export async function apiFetch(
  input: RequestInfo | URL,
  init: ApiFetchOptions = {},
): Promise<Response> {
  const { skipRefresh, ...fetchInit } = init;
  const opts: RequestInit = { credentials: 'include', ...fetchInit };

  const first = await fetch(input, opts);
  if (first.status !== 401 || skipRefresh) return first;

  const refreshed = await attemptRefresh();
  if (!refreshed) {
    redirectToLogin();
    return first;
  }
  return fetch(input, opts);
}

export async function apiJson<T>(input: RequestInfo | URL, init: ApiFetchOptions = {}): Promise<T> {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(init.headers ?? {}),
  };
  const res = await apiFetch(input, { ...init, headers });
  if (!res.ok) {
    let message = 'Request failed';
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      /* swallow */
    }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function fetchMe(): Promise<User | null> {
  const res = await apiFetch('/api/auth/me');
  if (!res.ok) return null;
  const data = (await res.json()) as { user: User };
  return data.user ?? null;
}

// ---------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------

export interface ExpenseListOptions {
  accountId?: string;
  /** ISO date (YYYY-MM-DD or full ISO). Inclusive. */
  from?: string;
  /** ISO date. Inclusive. */
  to?: string;
}

export const getAllExpenses = async (
  accountIdOrOpts?: string | ExpenseListOptions,
  fromOpt?: string,
): Promise<Expense[]> => {
  const opts: ExpenseListOptions =
    typeof accountIdOrOpts === 'string' || accountIdOrOpts === undefined
      ? { accountId: accountIdOrOpts, from: fromOpt }
      : accountIdOrOpts;

  const params = new URLSearchParams();
  if (opts.accountId) params.set('accountId', opts.accountId);
  if (opts.from) params.set('from', opts.from);
  if (opts.to) params.set('to', opts.to);

  const url = params.toString() ? `${API_BASE}?${params.toString()}` : API_BASE;
  const data = await apiJson<Expense[]>(url);

  return data.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime() || b.createdAt - a.createdAt,
  );
};

export const addExpenseToDB = async (expense: Expense): Promise<void> => {
  await apiJson(API_BASE, { method: 'POST', body: JSON.stringify(expense) });
};

export const updateExpenseInDB = async (expense: Expense): Promise<void> => {
  await apiJson(`${API_BASE}/${expense.id}`, {
    method: 'PUT',
    body: JSON.stringify(expense),
  });
};

export const deleteExpenseFromDB = async (id: string): Promise<void> => {
  await apiJson(`${API_BASE}/${id}`, { method: 'DELETE' });
};

// ---------------------------------------------------------------------------
// Budgets
// ---------------------------------------------------------------------------

const BUDGETS_API_BASE = '/api/budgets';

export const getBudgets = async (): Promise<BudgetWithStats[]> => {
  return apiJson<BudgetWithStats[]>(BUDGETS_API_BASE);
};

export const getBudgetDetails = async (
  id: string,
): Promise<BudgetWithStats & { transactions: Expense[] }> => {
  return apiJson(`${BUDGETS_API_BASE}/${id}`);
};

export const createBudget = async (
  budget: Omit<Budget, 'id' | 'createdAt' | 'userId'>,
): Promise<Budget> => {
  return apiJson<Budget>(BUDGETS_API_BASE, {
    method: 'POST',
    body: JSON.stringify(budget),
  });
};

export const updateBudget = async (id: string, budget: Partial<Budget>): Promise<Budget> => {
  return apiJson<Budget>(`${BUDGETS_API_BASE}/${id}`, {
    method: 'PUT',
    body: JSON.stringify(budget),
  });
};

export const deleteBudget = async (id: string): Promise<void> => {
  await apiJson(`${BUDGETS_API_BASE}/${id}`, { method: 'DELETE' });
};
