import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createBudget,
  deleteBudget,
  getBudgetDetails,
  getBudgets,
  updateBudget,
} from '../services/api';
import type { Budget, BudgetWithStats, Expense } from '../types';

export function useBudgets() {
  return useQuery<BudgetWithStats[], Error>({
    queryKey: ['budgets'],
    queryFn: () => getBudgets(),
  });
}

export function useBudgetDetails(id: string | undefined) {
  return useQuery<BudgetWithStats & { transactions: Expense[] }, Error>({
    queryKey: ['budget', id],
    queryFn: () => {
      if (!id) throw new Error('Missing budget id');
      return getBudgetDetails(id);
    },
    enabled: !!id,
  });
}

export function useCreateBudget() {
  const qc = useQueryClient();
  return useMutation<Budget, Error, Omit<Budget, 'id' | 'createdAt' | 'userId'>>({
    mutationFn: (budget) => createBudget(budget),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['budgets'] }),
  });
}

export function useUpdateBudget() {
  const qc = useQueryClient();
  return useMutation<Budget, Error, { id: string; budget: Partial<Budget> }>({
    mutationFn: ({ id, budget }) => updateBudget(id, budget),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['budgets'] });
      qc.invalidateQueries({ queryKey: ['budget', vars.id] });
    },
  });
}

export function useDeleteBudget() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => deleteBudget(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['budgets'] }),
  });
}
