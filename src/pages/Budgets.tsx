import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import Layout from '../components/Layout';
import BudgetCard from '../components/BudgetCard';
import BudgetForm from '../components/BudgetForm';
import { useBudgets, useCreateBudget, useUpdateBudget, useDeleteBudget } from '../hooks/useBudgets';
import { showToast } from '../lib/toast';
import type { Budget, BudgetWithStats } from '../types';

const Budgets: React.FC = () => {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingBudget, setEditingBudget] = useState<BudgetWithStats | null>(null);

  const budgetsQuery = useBudgets();
  const createBudgetMutation = useCreateBudget();
  const updateBudgetMutation = useUpdateBudget();
  const deleteBudgetMutation = useDeleteBudget();

  const budgets = budgetsQuery.data ?? [];
  const isLoading = budgetsQuery.isLoading;

  const handleCreate = () => {
    setEditingBudget(null);
    setIsFormOpen(true);
  };

  const handleEdit = (budget: BudgetWithStats) => {
    setEditingBudget(budget);
    setIsFormOpen(true);
  };

  const handleDelete = (id: string) => {
    if (!confirm('Are you sure you want to delete this budget?')) return;
    deleteBudgetMutation.mutate(id, {
      onSuccess: () => showToast('Budget deleted', 'success'),
    });
  };

  const handleSubmit = async (data: Omit<Budget, 'id' | 'createdAt' | 'userId'>) => {
    if (editingBudget) {
      await updateBudgetMutation.mutateAsync({ id: editingBudget.id, budget: data });
      showToast('Budget updated', 'success');
    } else {
      await createBudgetMutation.mutateAsync(data);
      showToast('Budget created', 'success');
    }
    setIsFormOpen(false);
  };

  return (
    <Layout>
      <div className="pb-20">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Budgets</h1>
          <button
            type="button"
            onClick={handleCreate}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" aria-hidden="true" /> Create Budget
          </button>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-pulse" aria-hidden="true">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-40 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                <div className="h-4 w-1/2 bg-slate-200 dark:bg-slate-700 rounded mb-3" />
                <div className="h-3 w-full bg-slate-200 dark:bg-slate-700 rounded mb-2" />
                <div className="h-3 w-2/3 bg-slate-200 dark:bg-slate-700 rounded" />
              </div>
            ))}
          </div>
        ) : budgets.length === 0 ? (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-8 text-center">
            <div className="w-16 h-16 bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-4">
              <Plus className="w-8 h-8 text-slate-400" aria-hidden="true" />
            </div>
            <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-2">No budgets yet</h3>
            <p className="text-slate-500 dark:text-slate-400 mb-6 max-w-sm mx-auto">
              Create a budget to track your spending and save money for your goals.
            </p>
            <button
              type="button"
              onClick={handleCreate}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg font-medium transition-colors"
            >
              Create First Budget
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {budgets.map(budget => (
              <BudgetCard
                key={budget.id}
                budget={budget}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}

        {isFormOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center md:p-4">
            <div
              className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm transition-opacity"
              onClick={() => setIsFormOpen(false)}
              aria-hidden="true"
            />
            <div
              className="relative w-full max-w-lg h-full md:max-h-[90vh] md:rounded-xl bg-slate-800 shadow-lg overflow-y-auto"
              role="dialog"
              aria-modal="true"
              aria-label={editingBudget ? 'Edit budget' : 'Create budget'}
            >
              <BudgetForm
                initialData={editingBudget}
                onSubmit={handleSubmit}
                onCancel={() => setIsFormOpen(false)}
              />
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Budgets;
