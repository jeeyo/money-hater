import type { Expense, Budget, BudgetWithStats } from '../types';

const API_BASE = '/api/expenses';

/**
 * Get authorization headers with JWT token
 */
export function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` })
  };
}

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
  // Backwards compatible: `getAllExpenses(accountId)` and
  // `getAllExpenses(accountId, fromIso)` still work; a single options
  // object is preferred for new code.
  const opts: ExpenseListOptions =
    typeof accountIdOrOpts === 'string' || accountIdOrOpts === undefined
      ? { accountId: accountIdOrOpts, from: fromOpt }
      : accountIdOrOpts;

  const params = new URLSearchParams();
  if (opts.accountId) params.set('accountId', opts.accountId);
  if (opts.from) params.set('from', opts.from);
  if (opts.to) params.set('to', opts.to);

  const url = params.toString() ? `${API_BASE}?${params.toString()}` : API_BASE;
  const response = await fetch(url, {
    headers: getAuthHeaders()
  });

  if (response.status === 401) {
    // Token expired or invalid - redirect to login
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  if (!response.ok) throw new Error('Failed to fetch expenses');

  const data = await response.json() as Expense[];
  // Sort by date (newest first), then by creation time
  return data.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime() || b.createdAt - a.createdAt);
};

export const addExpenseToDB = async (expense: Expense): Promise<void> => {
  const response = await fetch(API_BASE, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(expense),
  });

  if (response.status === 401) {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  if (!response.ok) throw new Error('Failed to add expense');
};

export const updateExpenseInDB = async (expense: Expense): Promise<void> => {
  const response = await fetch(`${API_BASE}/${expense.id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(expense),
  });

  if (response.status === 401) {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  if (!response.ok) throw new Error('Failed to update expense');
};

export const deleteExpenseFromDB = async (id: string): Promise<void> => {
  const response = await fetch(`${API_BASE}/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });

  if (response.status === 401) {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  if (!response.ok) throw new Error('Failed to delete expense');
};

// Budget API
const BUDGETS_API_BASE = '/api/budgets';

export const getBudgets = async (): Promise<BudgetWithStats[]> => {
  const response = await fetch(BUDGETS_API_BASE, {
    headers: getAuthHeaders()
  });
  if (!response.ok) throw new Error('Failed to fetch budgets');
  return response.json();
};

export const getBudgetDetails = async (id: string): Promise<BudgetWithStats & { transactions: Expense[] }> => {
  const response = await fetch(`${BUDGETS_API_BASE}/${id}`, {
    headers: getAuthHeaders()
  });
  if (!response.ok) throw new Error('Failed to fetch budget details');
  return response.json();
};

export const createBudget = async (budget: Omit<Budget, 'id' | 'createdAt' | 'userId'>): Promise<Budget> => {
  const response = await fetch(BUDGETS_API_BASE, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(budget),
  });
  if (!response.ok) throw new Error('Failed to create budget');
  return response.json();
};

export const updateBudget = async (id: string, budget: Partial<Budget>): Promise<Budget> => {
  const response = await fetch(`${BUDGETS_API_BASE}/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(budget),
  });
  if (!response.ok) throw new Error('Failed to update budget');
  return response.json();
};

export const deleteBudget = async (id: string): Promise<void> => {
  const response = await fetch(`${BUDGETS_API_BASE}/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  if (!response.ok) throw new Error('Failed to delete budget');
};
