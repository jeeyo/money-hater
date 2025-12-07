import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import Layout from '../components/Layout';
import BudgetForm from '../components/BudgetForm';
import Toast, { type ToastType } from '../components/Toast';
import { getBudgetDetails, deleteBudget, updateBudget } from '../services/api';
import type { BudgetWithStats, Expense, Budget } from '../types';
import { getCategoryIcon } from '../utils/categoryIcons';

const BudgetDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [budget, setBudget] = useState<(BudgetWithStats & { transactions: Expense[] }) | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);

  useEffect(() => {
    if (id) loadData();
  }, [id]);

  const loadData = async () => {
    try {
      setIsLoading(true);
      if (id) {
        const data = await getBudgetDetails(id);
        setBudget(data);
      }
    } catch (error) {
      console.error("Failed to load budget details:", error);
      setToast({ message: 'Failed to load budget details', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (confirm('Are you sure you want to delete this budget?')) {
      try {
        if (id) await deleteBudget(id);
        setToast({ message: 'Budget deleted successfully', type: 'success' });
        setTimeout(() => navigate('/budgets'), 1000);
      } catch (error) {
        console.error('Failed to delete budget:', error);
        setToast({ message: 'Failed to delete budget', type: 'error' });
      }
    }
  };

  const handleUpdate = async (data: Omit<Budget, 'id' | 'createdAt' | 'userId'>) => {
    try {
      if (budget) {
        await updateBudget(budget.id, data);
        setToast({ message: 'Budget updated successfully', type: 'success' });
        setIsFormOpen(false);
        loadData();
      }
    } catch (error) {
      console.error('Failed to update budget:', error);
      setToast({ message: 'Failed to update budget', type: 'error' });
      throw error;
    }
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        </div>
      </Layout>
    );
  }

  if (!budget) {
    return (
      <Layout>
        <div className="p-8 text-center text-slate-500">Budget not found</div>
      </Layout>
    );
  }

  const percent = Math.min((budget.spent / budget.amount) * 100, 100);
  const isOverBudget = budget.spent > budget.amount;
  const daysLeft = Math.ceil((new Date(budget.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));

  // Projection logic
  const totalDays = Math.ceil((new Date(budget.endDate).getTime() - new Date(budget.startDate).getTime()) / (1000 * 60 * 60 * 24));
  const daysPassed = Math.ceil((Date.now() - new Date(budget.startDate).getTime()) / (1000 * 60 * 60 * 24));
  const idealDaily = budget.amount / totalDays;
  const actualDaily = daysPassed > 0 ? budget.spent / daysPassed : 0;
  const projectedSpending = actualDaily * totalDays;

  const gaugeData = [
    { name: 'Spent', value: budget.spent },
    { name: 'Remaining', value: Math.max(0, budget.amount - budget.spent) }
  ];
  const COLORS = [isOverBudget ? '#ef4444' : '#10b981', '#1e293b'];

  return (
    <Layout>
      <div className="pb-20">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <button onClick={() => navigate('/budgets')} className="p-2 -ml-2 text-slate-400 hover:text-white transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-xl font-bold text-white">Budget Details</h1>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setIsFormOpen(true)} className="p-2 text-slate-400 hover:text-indigo-400 transition-colors">
              <Pencil className="w-5 h-5" />
            </button>
            <button onClick={handleDelete} className="p-2 text-slate-400 hover:text-red-400 transition-colors">
              <Trash2 className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Main Card */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 mb-6">
          <div className="text-center mb-6">
            <h2 className="text-lg font-semibold text-white mb-1">{budget.name}</h2>
            <div className="text-3xl font-bold text-white mb-1">฿{budget.amount.toLocaleString()}</div>
            <div className="flex justify-between items-center text-sm px-4">
              <div className="text-left">
                <div className="text-slate-400 text-xs">Spent</div>
                <div className={isOverBudget ? 'text-red-400' : 'text-slate-200'}>฿{budget.spent.toLocaleString()}</div>
              </div>
              <div className="text-right">
                <div className="text-slate-400 text-xs">Left</div>
                <div className="text-white">฿{Math.max(0, budget.amount - budget.spent).toLocaleString()}</div>
              </div>
            </div>
          </div>

          {/* Gauge */}
          <div className="h-48 relative mb-4">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={gaugeData}
                  cx="50%"
                  cy="70%"
                  startAngle={180}
                  endAngle={0}
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="value"
                  stroke="none"
                >
                  {gaugeData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex items-center justify-center pt-24 flex-col pointer-events-none">
              <span className={`text-2xl font-bold ${isOverBudget ? 'text-red-500' : 'text-emerald-500'}`}>
                {percent.toFixed(0)}%
              </span>
            </div>
          </div>

          <div className="flex items-center justify-center gap-2 mb-6">
            <div className="bg-slate-700/50 px-3 py-1 rounded-full text-xs text-slate-400">
              {new Date(budget.startDate).toLocaleDateString()} - {new Date(budget.endDate).toLocaleDateString()}
            </div>
            <div className="bg-slate-700/50 px-3 py-1 rounded-full text-xs text-slate-400">
              {Math.max(0, daysLeft)} days left
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 gap-4 border-t border-slate-700 pt-6">
            <div className="flex justify-between items-center">
              <span className="text-slate-400 text-sm">Daily Recommended</span>
              <span className="text-white font-medium">฿{idealDaily.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400 text-sm">Actual Daily Avg</span>
              <span className="text-white font-medium">฿{actualDaily.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400 text-sm">Projected Spending</span>
              <span className={`font-medium ${projectedSpending > budget.amount ? 'text-red-400' : 'text-emerald-400'}`}>
                ฿{projectedSpending.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* Transactions List */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-700">
            <h3 className="font-semibold text-white">Transactions</h3>
          </div>
          {budget.transactions && budget.transactions.length > 0 ? (
            <div className="divide-y divide-slate-700">
              {budget.transactions.map(t => (
                <div key={t.id} className="p-4 flex items-center justify-between hover:bg-slate-700/30 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-xl">
                      {getCategoryIcon(t.category)}
                    </div>
                    <div>
                      <div className="text-white font-medium text-sm">{t.description}</div>
                      <div className="text-slate-400 text-xs">{new Date(t.date).toLocaleDateString()} • {t.category}</div>
                    </div>
                  </div>
                  <div className="text-white font-semibold">
                    -฿{t.amount.toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-slate-500 text-sm">
              No transactions found for this period.
            </div>
          )}
        </div>

        {/* Modal Overlay */}
        {isFormOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm transition-opacity"
              onClick={() => setIsFormOpen(false)}
            />
            <div className="relative w-full max-w-lg z-10">
              <BudgetForm
                initialData={budget}
                onSubmit={handleUpdate}
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

export default BudgetDetails;
