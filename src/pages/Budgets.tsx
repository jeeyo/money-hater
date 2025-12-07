import React, { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import Layout from '../components/Layout';
import BudgetCard from '../components/BudgetCard';
import BudgetForm from '../components/BudgetForm';
import Toast, { type ToastType } from '../components/Toast';
import { getBudgets, createBudget, updateBudget, deleteBudget } from '../services/api';
import type { Budget, BudgetWithStats } from '../types';

const Budgets: React.FC = () => {
  const [budgets, setBudgets] = useState<BudgetWithStats[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingBudget, setEditingBudget] = useState<BudgetWithStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);

  useEffect(() => {
    loadBudgets();
  }, []);

  const loadBudgets = async () => {
    try {
      setIsLoading(true);
      const data = await getBudgets();
      setBudgets(data);
    } catch (error) {
      console.error('Failed to load budgets:', error);
      setToast({ message: 'Failed to load budgets', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingBudget(null);
    setIsFormOpen(true);
  };

  const handleEdit = (budget: BudgetWithStats) => {
    setEditingBudget(budget);
    setIsFormOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this budget?')) {
      try {
        await deleteBudget(id);
        setToast({ message: 'Budget deleted successfully', type: 'success' });
        await loadBudgets();
      } catch (error) {
        console.error('Failed to delete budget:', error);
        setToast({ message: 'Failed to delete budget', type: 'error' });
      }
    }
  };

  const handleSubmit = async (data: Omit<Budget, 'id' | 'createdAt' | 'userId'>) => {
    try {
      if (editingBudget) {
        await updateBudget(editingBudget.id, data);
        setToast({ message: 'Budget updated successfully', type: 'success' });
      } else {
        await createBudget(data);
        setToast({ message: 'Budget created successfully', type: 'success' });
      }
      setIsFormOpen(false);
      await loadBudgets();
    } catch (error) {
      console.error('Failed to save budget:', error);
      setToast({ message: 'Failed to save budget', type: 'error' });
      throw error;
    }
  };

  return (
    <Layout>
      <div className="pb-20">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Running Budgets</h1>
          <button
            onClick={handleCreate}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" /> Create Budget
          </button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          </div>
        ) : budgets.length === 0 ? (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-8 text-center">
            <div className="w-16 h-16 bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-4">
              <Plus className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-2">No budgets yet</h3>
            <p className="text-slate-500 dark:text-slate-400 mb-6 max-w-sm mx-auto">
              Create a budget to track your spending and save money for your goals.
            </p>
            <button
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

        {/* Form Modal */}
        {isFormOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm transition-opacity"
              onClick={() => setIsFormOpen(false)}
            />
            <div className="relative w-full max-w-lg z-10">
              <BudgetForm
                initialData={editingBudget}
                onSubmit={handleSubmit}
                onCancel={() => setIsFormOpen(false)}
              />
            </div>
          </div>
        )}

        {/* Toast */}
        {toast && (
          <Toast
            message={toast.message}
            type={toast.type}
            onClose={() => setToast(null)}
          />
        )}
      </div>
    </Layout>
  );
};

export default Budgets;
