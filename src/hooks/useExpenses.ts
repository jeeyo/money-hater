import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import {
  addExpenseToDB,
  deleteExpenseFromDB,
  getAllExpenses,
  updateExpenseInDB,
  type ExpenseListOptions,
} from '../services/api';
import type { Expense } from '../types';

const expensesKey = (opts?: ExpenseListOptions) => ['expenses', opts ?? null] as const;

/**
 * Fetch a list of expenses with the same filtering options as the API.
 * Pass `enabled: false` to defer the request (e.g. while account is loading).
 */
export function useExpenses(
  opts?: ExpenseListOptions,
  queryOptions?: Omit<UseQueryOptions<Expense[], Error, Expense[], readonly unknown[]>, 'queryKey' | 'queryFn'>,
) {
  return useQuery<Expense[], Error, Expense[], readonly unknown[]>({
    queryKey: expensesKey(opts),
    queryFn: () => getAllExpenses(opts),
    ...queryOptions,
  });
}

/** Invalidate every cached expense list. Call after mutations or external events. */
export function useInvalidateExpenses() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['expenses'] });
}

export function useAddExpense() {
  const qc = useQueryClient();
  return useMutation<void, Error, Expense>({
    mutationFn: (expense) => addExpenseToDB(expense),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['expenses'] }),
  });
}

export function useUpdateExpense() {
  const qc = useQueryClient();
  return useMutation<void, Error, Expense>({
    mutationFn: (expense) => updateExpenseInDB(expense),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['expenses'] }),
  });
}

export function useDeleteExpense() {
  const qc = useQueryClient();
  return useMutation<void, Error, string, { previous: Map<readonly unknown[], Expense[]> }>({
    mutationFn: (id) => deleteExpenseFromDB(id),
    // Optimistic remove from every cached expense list so the UI updates
    // immediately. We snapshot in onMutate and roll back from onError.
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ['expenses'] });
      const previous = new Map<readonly unknown[], Expense[]>();
      const lists = qc.getQueriesData<Expense[]>({ queryKey: ['expenses'] });
      for (const [key, data] of lists) {
        if (data) {
          previous.set(key, data);
          qc.setQueryData<Expense[]>(key, data.filter((e) => e.id !== id));
        }
      }
      return { previous };
    },
    onError: (_err, _id, ctx) => {
      if (!ctx) return;
      for (const [key, data] of ctx.previous) {
        qc.setQueryData(key, data);
      }
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['expenses'] }),
  });
}
