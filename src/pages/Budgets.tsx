import React, { useState } from 'react';
import { Plus, Wallet } from 'lucide-react';
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
      <div className="pb-20 animate-fade-in-up">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-white">Budgets</h1>
          <button
            type="button"
            onClick={handleCreate}
            className="bg-gradient-to-r from-violet-600 to-indigo-500
              hover:from-violet-500 hover:to-indigo-400
              text-white px-5 py-2.5 rounded-xl flex items-center gap-2
              text-sm font-semibold transition-all shadow-lg shadow-violet-600/20"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            Create Budget
          </button>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" aria-hidden="true">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="bg-[#1e293b] rounded-2xl border border-white/5 overflow-hidden"
              >
                <div className="skeleton h-1" />
                <div className="p-5">
                  <div className="skeleton h-4 w-1/2 rounded mb-3" />
                  <div className="skeleton h-3 w-full rounded mb-2" />
                  <div className="skeleton h-2 w-full rounded mt-4" />
                </div>
              </div>
            ))}
          </div>
        ) : budgets.length === 0 ? (
          <div className="bg-[#1e293b] rounded-2xl border border-white/5 p-12 text-center">
            <div className="w-16 h-16 bg-violet-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-violet-500/20">
              <Wallet className="w-8 h-8 text-violet-400" aria-hidden="true" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">No budgets yet</h3>
            <p className="text-slate-400 mb-6 max-w-sm mx-auto text-sm">
              Create a budget to track your spending and save money for your goals.
            </p>
            <button
              type="button"
              onClick={handleCreate}
              className="bg-gradient-to-r from-violet-600 to-indigo-500
                hover:from-violet-500 hover:to-indigo-400
                text-white px-6 py-2.5 rounded-xl font-semibold transition-all
                shadow-lg shadow-violet-600/20 inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Create First Budget
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {budgets.map((budget, index) => (
              <BudgetCard
                key={budget.id}
                budget={budget}
                onEdit={handleEdit}
                onDelete={handleDelete}
                style={{ animationDelay: `${index * 75}ms` } as React.CSSProperties}
              />
            ))}
          </div>
        )}

        {/* Modal */}
        {isFormOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center md:p-4">
            <div
              className="absolute inset-0 bg-[#0f172a]/80 backdrop-blur-md"
              onClick={() => setIsFormOpen(false)}
              aria-hidden="true"
            />
            <div
              className="relative w-full max-w-lg h-full md:max-h-[90vh] md:rounded-2xl
                bg-[#0f172a] shadow-2xl overflow-y-auto animate-scale-in"
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
