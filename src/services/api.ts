import type { Expense } from '../types';

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

export const getAllExpenses = async (accountId?: string): Promise<Expense[]> => {
  const url = accountId ? `${API_BASE}?accountId=${accountId}` : API_BASE;
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
