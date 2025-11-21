import type { Expense } from '../types';

const API_BASE = '/api/expenses';

export const getAllExpenses = async (): Promise<Expense[]> => {
  const response = await fetch(API_BASE);
  if (!response.ok) throw new Error('Failed to fetch expenses');
  const data = await response.json() as Expense[];
  // Sort by date (newest first), then by creation time
  return data.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime() || b.createdAt - a.createdAt);
};

export const addExpenseToDB = async (expense: Expense): Promise<void> => {
  const response = await fetch(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(expense),
  });
  if (!response.ok) throw new Error('Failed to add expense');
};

export const updateExpenseInDB = async (expense: Expense): Promise<void> => {
  const response = await fetch(`${API_BASE}/${expense.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(expense),
  });
  if (!response.ok) throw new Error('Failed to update expense');
};

export const deleteExpenseFromDB = async (id: string): Promise<void> => {
  const response = await fetch(`${API_BASE}/${id}`, {
    method: 'DELETE',
  });
  if (!response.ok) throw new Error('Failed to delete expense');
};
