import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Plus, TrendingUp, TrendingDown, ArrowLeftRight } from 'lucide-react';
import { LineChart, Line, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { useAccount } from '../context/useAccount';
import { useNotification } from '../context/useNotification';
import ExpenseForm from '../components/ExpenseForm';
import { type Expense, ExpenseCategory, IncomeCategory, type TransactionType } from '../types';
import { addExpenseToDB, getBudgets } from '../services/api';
import {
  useExpenses,
  useDeleteExpense,
  useUpdateExpense,
  useInvalidateExpenses,
} from '../hooks/useExpenses';
import Layout from '../components/Layout';
import { getCategoryIcon } from '../utils/categoryIcons';
import {
  checkBudgetThreshold,
  getNotificationTypeForThreshold,
  formatBudgetThresholdMessage,
  doesTransactionAffectBudget,
} from '../utils/budgetNotifications';
import { showToast } from '../lib/toast';

const COLORS = [
  '#7c3aed',
  '#6366f1',
  '#22d3ee',
  '#10b981',
  '#f59e0b',
  '#f43f5e',
  '#8b5cf6',
  '#ec4899',
];

function dashboardFromDate(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 5);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

const Dashboard: React.FC = () => {
  const { selectedAccount, isLoading: isAccountLoading } = useAccount();
  const { addSystemNotification } = useNotification();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [sharedFile] = useState<File | null>(null);

  const fromDate = useMemo(() => dashboardFromDate(), []);
  const expensesQuery = useExpenses(
    selectedAccount ? { accountId: selectedAccount.id, from: fromDate } : undefined,
    { enabled: !!selectedAccount },
  );
  const expenses = expensesQuery.data ?? [];

  const deleteExpenseMutation = useDeleteExpense();
  const updateExpenseMutation = useUpdateExpense();
  const invalidateExpenses = useInvalidateExpenses();

  const migrationRan = useRef(false);
  useEffect(() => {
    if (migrationRan.current) return;
    migrationRan.current = true;
    const localData = localStorage.getItem('smartspend_expenses');
    if (!localData) return;
    (async () => {
      try {
        const parsed: Expense[] = JSON.parse(localData);
        for (const expense of parsed) {
          if (!expense.type) expense.type = 'expense';
          try {
            await addExpenseToDB(expense);
          } catch {
            /* ignore duplicate */
          }
        }
        localStorage.removeItem('smartspend_expenses');
        await invalidateExpenses();
      } catch (err) {
        console.error('Failed to migrate local expenses', err);
      }
    })();
  }, [invalidateExpenses]);

  const isLoading = isAccountLoading || (selectedAccount && expensesQuery.isLoading);

  useEffect(() => {
    if (isFormOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isFormOpen]);

  useEffect(() => {
    const handler = () => invalidateExpenses();
    window.addEventListener('expense-added', handler);
    return () => window.removeEventListener('expense-added', handler);
  }, [invalidateExpenses]);

  const handleSaveExpense = async (data: {
    description: string;
    amount: number;
    date: string;
    category: ExpenseCategory | IncomeCategory;
    type: TransactionType;
    tags: string[];
  }) => {
    if (editingExpense) {
      const updatedExpense = { ...editingExpense, ...data };
      handleCloseForm();
      try {
        await updateExpenseMutation.mutateAsync(updatedExpense);
      } catch {
        /* toast handled */
      }
      return;
    }
    const newExpense: Expense = {
      id: crypto.randomUUID(),
      // eslint-disable-next-line react-hooks/purity
      createdAt: Date.now(),
      accountId: selectedAccount?.id,
      ...data,
    };
    handleCloseForm();
    try {
      await addExpenseToDB(newExpense);
      await invalidateExpenses();
    } catch (err) {
      console.error('Failed to add expense', err);
      showToast('Failed to add expense', 'error');
      return;
    }
    if (newExpense.type !== 'expense' || !selectedAccount) return;
    try {
      const budgets = await getBudgets();
      const accountBudgets = budgets.filter(
        (b) => !b.accountId || b.accountId === selectedAccount.id,
      );
      for (const budget of accountBudgets) {
        if (!doesTransactionAffectBudget(newExpense, budget)) continue;
        const previousSpent = budget.spent - newExpense.amount;
        const alert = checkBudgetThreshold(budget, previousSpent);
        if (!alert) continue;
        const { title, message } = formatBudgetThresholdMessage(alert);
        const notificationType = getNotificationTypeForThreshold(alert.threshold);
        await addSystemNotification(title, message, notificationType);
      }
    } catch (err) {
      console.error('Failed to check budget thresholds', err);
    }
  };

  const deleteExpense = (id: string) => deleteExpenseMutation.mutate(id);

  const handleEditClick = (expense: Expense) => {
    setEditingExpense(expense);
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setTimeout(() => setEditingExpense(null), 200);
  };

  const { totalIncome, totalExpense, netBalance } = useMemo(() => {
    return expenses.reduce(
      (acc, item) => {
        if (item.type === 'income') {
          acc.totalIncome += item.amount;
          acc.netBalance += item.amount;
        } else {
          acc.totalExpense += item.amount;
          acc.netBalance -= item.amount;
        }
        return acc;
      },
      { totalIncome: 0, totalExpense: 0, netBalance: 0 },
    );
  }, [expenses]);

  const currentMonthStats = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    return expenses
      .filter((e) => {
        if (!e.date) return false;
        const [year, month] = e.date.split('-').map(Number);
        return year === currentYear && month === currentMonth;
      })
      .reduce(
        (acc, e) => {
          if (e.type === 'income') acc.income += e.amount;
          else acc.expense += e.amount;
          return acc;
        },
        { income: 0, expense: 0 },
      );
  }, [expenses]);

  const categoryData = useMemo(() => {
    const map = new Map<string, number>();
    expenses
      .filter((e) => e.type !== 'income')
      .forEach((exp) => {
        map.set(exp.category, (map.get(exp.category) || 0) + exp.amount);
      });
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 4);
  }, [expenses]);

  const chartData = useMemo(() => {
    const dataMap = new Map<string, { income: number; expense: number }>();
    const now = new Date();
    const monthsData: { label: string; key: string }[] = [];
    for (let i = 4; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      const monthKey = `${year}-${month.toString().padStart(2, '0')}`;
      const monthLabel = date.toLocaleString('en-US', { month: 'short' });
      monthsData.push({ label: monthLabel, key: monthKey });
      dataMap.set(monthKey, { income: 0, expense: 0 });
    }
    expenses.forEach((exp) => {
      if (!exp.date) return;
      const expenseDate = new Date(exp.date);
      const year = expenseDate.getFullYear();
      const month = expenseDate.getMonth() + 1;
      const monthKey = `${year}-${month.toString().padStart(2, '0')}`;
      if (dataMap.has(monthKey)) {
        const current = dataMap.get(monthKey)!;
        if (exp.type === 'income') current.income += exp.amount;
        else current.expense += exp.amount;
        dataMap.set(monthKey, current);
      }
    });
    return monthsData.map((m) => ({
      month: m.label,
      income: dataMap.get(m.key)?.income || 0,
      expense: dataMap.get(m.key)?.expense || 0,
    }));
  }, [expenses]);

  const recentTransactions = useMemo(() => {
    return [...expenses]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 8);
  }, [expenses]);

  return (
    <Layout>
      {isLoading ? (
        <DashboardSkeleton />
      ) : (
        <div className="pb-16 animate-fade-in-up">
          {/* Top Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {/* Hero — Net Balance */}
            <div className="bg-gradient-to-br from-[#1e293b] to-[#0f172a] rounded-2xl border border-white/5 p-5 shadow-lg">
              <div className="flex items-center gap-2 text-slate-400 text-xs font-medium mb-3 uppercase tracking-wider">
                <div className="w-1.5 h-1.5 rounded-full bg-violet-400" aria-hidden="true" />
                Net Balance
              </div>
              <div className="text-4xl font-bold mb-2 text-white tabular-nums">
                <span className="gradient-text">฿</span>
                {netBalance.toFixed(2)}
              </div>
              <div className="flex items-center gap-4 text-xs mb-4">
                <span className="flex items-center gap-1 text-emerald-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_4px_rgba(16,185,129,0.8)]" />
                  +฿{totalIncome.toFixed(0)}
                </span>
                <span className="flex items-center gap-1 text-rose-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400 shadow-[0_0_4px_rgba(244,63,94,0.8)]" />
                  -฿{totalExpense.toFixed(0)}
                </span>
              </div>
              <div className="h-20 -mx-1">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <Line
                      type="monotone"
                      dataKey="income"
                      stroke="#10b981"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="expense"
                      stroke="#f43f5e"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Spending by Category */}
            <div className="bg-[#1e293b] rounded-2xl border border-white/5 p-5">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Spending by Category
                </span>
              </div>
              <div className="flex items-center justify-center mb-4">
                <div className="w-32 h-32">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={
                          categoryData.length > 0 ? categoryData : [{ name: 'No data', value: 1 }]
                        }
                        cx="50%"
                        cy="50%"
                        innerRadius={35}
                        outerRadius={55}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {(categoryData.length > 0
                          ? categoryData
                          : [{ name: 'No data', value: 1 }]
                        ).map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="space-y-1.5">
                {categoryData.slice(0, 3).map((cat, idx) => (
                  <div key={cat.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: COLORS[idx] }}
                        aria-hidden="true"
                      />
                      <span className="text-slate-400 text-xs">{cat.name}</span>
                    </div>
                    <span className="text-white text-xs tabular-nums font-medium">
                      ฿{cat.value.toFixed(0)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* This Month */}
            <div className="bg-[#1e293b] rounded-2xl border border-white/5 p-5">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                  This Month
                </span>
              </div>
              <div className="space-y-5">
                <div>
                  <div className="text-slate-500 text-xs mb-1">Income</div>
                  <div className="text-emerald-400 text-2xl font-bold flex items-center gap-2 tabular-nums">
                    <TrendingUp className="w-5 h-5" aria-hidden="true" />
                    +฿{currentMonthStats.income.toFixed(0)}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500 text-xs mb-1">Expense</div>
                  <div className="text-rose-400 text-2xl font-bold flex items-center gap-2 tabular-nums">
                    <TrendingDown className="w-5 h-5" aria-hidden="true" />
                    -฿{currentMonthStats.expense.toFixed(0)}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Recent Transactions */}
          <div className="bg-[#1e293b] rounded-2xl border border-white/5 overflow-hidden">
            <div className="px-5 py-4 border-b border-white/5 flex items-center gap-3">
              <ArrowLeftRight className="w-4 h-4 text-violet-400" aria-hidden="true" />
              <h2 className="text-base font-semibold text-white">Recent Transactions</h2>
            </div>

            {recentTransactions.length === 0 ? (
              <div className="p-12 text-center text-slate-600">
                <ArrowLeftRight className="w-8 h-8 mx-auto mb-3 opacity-30" />
                <p className="text-slate-500">No transactions yet</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full table-fixed">
                  <colgroup>
                    <col className="w-20" />
                    <col className="w-12" />
                    <col className="w-auto" />
                    <col className="w-32" />
                  </colgroup>
                  <thead className="bg-white/[0.03]">
                    <tr>
                      <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                        Date
                      </th>
                      <th className="px-5 py-3 text-left text-xs font-medium text-slate-500">
                        <span className="sr-only">Icon</span>
                      </th>
                      <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                        Description
                      </th>
                      <th className="px-5 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                        Amount
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentTransactions.map((transaction) => (
                      <tr
                        key={transaction.id}
                        className="hover:bg-white/[0.03] cursor-pointer transition-colors border-b border-white/5 last:border-0"
                        onClick={() => handleEditClick(transaction)}
                      >
                        <td className="px-5 py-3.5 text-sm text-slate-400 whitespace-nowrap">
                          {new Date(transaction.date).toLocaleDateString('en-GB', {
                            day: '2-digit',
                            month: 'short',
                          })}
                        </td>
                        <td className="px-5 py-3.5">
                          <div
                            className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center"
                            aria-hidden="true"
                          >
                            {getCategoryIcon(transaction.category)}
                          </div>
                        </td>
                        <td
                          className="px-5 py-3.5 text-sm text-slate-300 truncate"
                          title={transaction.description}
                        >
                          {transaction.description}
                        </td>
                        <td
                          className={`px-5 py-3.5 text-sm font-semibold text-right whitespace-nowrap tabular-nums
                          ${transaction.type === 'income' ? 'text-emerald-400' : 'text-rose-400'}`}
                        >
                          {transaction.type === 'income' ? '+' : '-'}฿
                          {transaction.amount.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Floating Action Button */}
          <button
            type="button"
            onClick={() => {
              setEditingExpense(null);
              setIsFormOpen(true);
            }}
            aria-label="Add new transaction"
            className="fixed bottom-20 right-6 md:bottom-6
              bg-gradient-to-br from-violet-600 to-indigo-500
              hover:from-violet-500 hover:to-indigo-400
              text-white p-4 rounded-full shadow-xl shadow-violet-600/30
              transition-all z-40 animate-float"
          >
            <Plus className="w-6 h-6" aria-hidden="true" />
          </button>

          {/* Modal */}
          {isFormOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center md:p-4">
              <div
                className="absolute inset-0 bg-[#0f172a]/80 backdrop-blur-md"
                onClick={handleCloseForm}
                aria-hidden="true"
              />
              <div
                className="relative w-full max-w-lg h-full md:max-h-[90vh] md:rounded-2xl
                  bg-[#0f172a] shadow-2xl overflow-y-auto animate-scale-in"
                role="dialog"
                aria-modal="true"
                aria-label={editingExpense ? 'Edit transaction' : 'Add transaction'}
              >
                <ExpenseForm
                  onSubmit={handleSaveExpense}
                  onCancel={handleCloseForm}
                  onDelete={
                    editingExpense
                      ? () => {
                          deleteExpense(editingExpense.id);
                          handleCloseForm();
                        }
                      : undefined
                  }
                  initialData={editingExpense}
                  initialFile={sharedFile}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </Layout>
  );
};

const DashboardSkeleton: React.FC = () => (
  <div className="pb-16" aria-hidden="true">
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      {[1, 2, 3].map((i) => (
        <div key={i} className="bg-[#1e293b] rounded-2xl border border-white/5 p-5 h-48">
          <div className="skeleton h-3 w-24 rounded mb-4" />
          <div className="skeleton h-8 w-36 rounded mb-3" />
          <div className="skeleton h-16 rounded" />
        </div>
      ))}
    </div>
    <div className="bg-[#1e293b] rounded-2xl border border-white/5 p-5">
      <div className="skeleton h-4 w-40 rounded mb-6" />
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 py-3 border-b border-white/5">
          <div className="skeleton h-8 w-8 rounded-lg" />
          <div className="skeleton flex-1 h-3 rounded" />
          <div className="skeleton h-3 w-16 rounded" />
        </div>
      ))}
    </div>
  </div>
);

export default Dashboard;
