import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Plus, TrendingUp, TrendingDown } from 'lucide-react';
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
  '#6366f1',
  '#8b5cf6',
  '#ec4899',
  '#f43f5e',
  '#f97316',
  '#eab308',
  '#84cc16',
  '#10b981',
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

  // Fetch expenses for the selected account, bounded to the chart window.
  const fromDate = useMemo(() => dashboardFromDate(), []);
  const expensesQuery = useExpenses(
    selectedAccount ? { accountId: selectedAccount.id, from: fromDate } : undefined,
    { enabled: !!selectedAccount },
  );
  const expenses = expensesQuery.data ?? [];

  const deleteExpenseMutation = useDeleteExpense();
  const updateExpenseMutation = useUpdateExpense();
  const invalidateExpenses = useInvalidateExpenses();

  // One-time migration of any local-storage expenses left behind by older
  // versions of the app. Runs once per mount so we don't re-trigger on
  // every account change.
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
            // ignore duplicate-key
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

  // Disable body scroll when dialog is open
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

  // Background receipt processing dispatches this event when it adds an expense.
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
        // toast already raised by global error handler
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

    // Threshold notifications run after the write. They're best-effort —
    // don't fail the user-visible flow if budget lookup errors.
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

  const deleteExpense = (id: string) => {
    deleteExpenseMutation.mutate(id);
  };

  const handleEditClick = (expense: Expense) => {
    setEditingExpense(expense);
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setTimeout(() => {
      setEditingExpense(null);
    }, 200);
  };

  // Calculate stats
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

  // Get current month stats
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
          if (e.type === 'income') {
            acc.income += e.amount;
          } else {
            acc.expense += e.amount;
          }
          return acc;
        },
        { income: 0, expense: 0 },
      );
  }, [expenses]);

  // Category data for pie chart
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

  // Chart data for line chart (last 5 months)
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
        if (exp.type === 'income') {
          current.income += exp.amount;
        } else {
          current.expense += exp.amount;
        }
        dataMap.set(monthKey, current);
      }
    });

    return monthsData.map((m) => ({
      month: m.label,
      income: dataMap.get(m.key)?.income || 0,
      expense: dataMap.get(m.key)?.expense || 0,
    }));
  }, [expenses]);

  // Recent transactions (last 8)
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
        <div className="pb-16">
          {/* Top Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2 mb-6">
            {/* Net Balance Card with Chart */}
            <div className="md:col-span-2 lg:col-span-1 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
              <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-sm mb-2">
                <div
                  className="w-4 h-4 bg-slate-200 dark:bg-slate-700 rounded"
                  aria-hidden="true"
                ></div>
                <span>Net Balance</span>
              </div>
              <div className="text-3xl font-bold mb-1 text-slate-900 dark:text-white">
                ฿{netBalance.toFixed(2)}
              </div>
              <div className="flex items-center gap-3 text-xs mb-3">
                <span className="text-green-600 dark:text-green-400">
                  +฿{totalIncome.toFixed(0)}
                </span>
                <span className="text-red-600 dark:text-red-400">-฿{totalExpense.toFixed(0)}</span>
              </div>
              <div className="h-24 -mx-2">
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
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-slate-600 dark:text-slate-400">
                  Spending by Category
                </span>
                <select
                  aria-label="Spending by category time range"
                  className="text-xs bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded px-2 py-1 text-slate-900 dark:text-white"
                >
                  <option>All Time</option>
                </select>
              </div>
              <div className="flex items-center justify-center mb-3">
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
                        paddingAngle={2}
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
              <div className="space-y-1 text-xs">
                {categoryData.slice(0, 3).map((cat, idx) => (
                  <div key={cat.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: COLORS[idx] }}
                        aria-hidden="true"
                      ></div>
                      <span className="text-slate-600 dark:text-slate-400">{cat.name}:</span>
                    </div>
                    <span className="text-slate-900 dark:text-white">฿{cat.value.toFixed(0)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* This Month Card */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
              <div className="flex items-center gap-2 mb-3">
                <div
                  className="w-4 h-4 bg-slate-200 dark:bg-slate-700 rounded"
                  aria-hidden="true"
                ></div>
                <span className="text-sm text-slate-600 dark:text-slate-400">This Month</span>
              </div>
              <div className="space-y-3">
                <div>
                  <div className="text-slate-600 dark:text-slate-400 text-xs mb-1">Income</div>
                  <div className="text-green-600 dark:text-green-400 text-xl font-semibold flex items-center gap-1">
                    <TrendingUp className="w-4 h-4" aria-hidden="true" />
                    +฿{currentMonthStats.income.toFixed(0)}
                  </div>
                </div>
                <div>
                  <div className="text-slate-600 dark:text-slate-400 text-xs mb-1">Expense</div>
                  <div className="text-red-600 dark:text-red-400 text-xl font-semibold flex items-center gap-1">
                    <TrendingDown className="w-4 h-4" aria-hidden="true" />
                    -฿{currentMonthStats.expense.toFixed(0)}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Recent Transactions Table */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2">
              <div
                className="w-4 h-4 bg-slate-200 dark:bg-slate-700 rounded"
                aria-hidden="true"
              ></div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                Recent Transactions
              </h2>
            </div>

            {recentTransactions.length === 0 ? (
              <div className="p-8 text-center text-slate-500 dark:text-slate-400">
                <p>No transactions yet</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full table-fixed">
                  <colgroup>
                    <col className="w-18" />
                    <col className="w-6" />
                    <col className="w-auto" />
                    <col className="w-32" />
                  </colgroup>
                  <thead className="bg-slate-50 dark:bg-slate-700/30">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 dark:text-slate-400">
                        Date
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 dark:text-slate-400">
                        <span className="sr-only">Category</span>
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 dark:text-slate-400">
                        Description
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-slate-600 dark:text-slate-400">
                        Amount
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                    {recentTransactions.map((transaction) => (
                      <tr
                        key={transaction.id}
                        className="hover:bg-slate-50 dark:hover:bg-slate-700/30 cursor-pointer transition-colors"
                        onClick={() => handleEditClick(transaction)}
                      >
                        <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300 whitespace-nowrap">
                          {new Date(transaction.date).toLocaleDateString('en-GB', {
                            day: '2-digit',
                            month: 'short',
                          })}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center">
                            <div
                              className="w-8 h-8 flex items-center justify-center"
                              aria-hidden="true"
                            >
                              {getCategoryIcon(transaction.category)}
                            </div>
                          </div>
                        </td>
                        <td
                          className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300 truncate"
                          title={transaction.description}
                        >
                          {transaction.description}
                        </td>
                        <td
                          className={`px-4 py-3 text-sm font-semibold text-right whitespace-nowrap ${
                            transaction.type === 'income'
                              ? 'text-green-600 dark:text-green-400'
                              : 'text-red-600 dark:text-red-400'
                          }`}
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
            className="fixed bottom-6 right-6 bg-indigo-600 hover:bg-indigo-700 text-white p-4 rounded-full shadow-lg transition-all hover:scale-105 z-40 flex items-center gap-2 group"
          >
            <Plus
              className="w-6 h-6 group-hover:rotate-90 transition-transform"
              aria-hidden="true"
            />
          </button>

          {/* Modal Overlay */}
          {isFormOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center md:p-4">
              <div
                className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm transition-opacity"
                onClick={handleCloseForm}
                aria-hidden="true"
              />
              <div
                className="relative w-full max-w-lg h-full md:max-h-[90vh] md:rounded-xl bg-slate-800 shadow-lg overflow-y-auto"
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
  <div className="pb-16 animate-pulse" aria-hidden="true">
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2 mb-6">
      <div className="md:col-span-2 lg:col-span-1 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 h-44">
        <div className="h-3 w-24 bg-slate-200 dark:bg-slate-700 rounded mb-3" />
        <div className="h-8 w-32 bg-slate-200 dark:bg-slate-700 rounded mb-3" />
        <div className="h-16 bg-slate-100 dark:bg-slate-700/50 rounded" />
      </div>
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 h-44">
        <div className="h-3 w-32 bg-slate-200 dark:bg-slate-700 rounded mb-3" />
        <div className="h-24 w-24 mx-auto bg-slate-200 dark:bg-slate-700 rounded-full" />
      </div>
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 h-44">
        <div className="h-3 w-24 bg-slate-200 dark:bg-slate-700 rounded mb-3" />
        <div className="h-6 w-32 bg-slate-200 dark:bg-slate-700 rounded mb-2" />
        <div className="h-6 w-32 bg-slate-200 dark:bg-slate-700 rounded" />
      </div>
    </div>
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
      <div className="h-4 w-40 bg-slate-200 dark:bg-slate-700 rounded mb-4" />
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 py-3">
          <div className="h-8 w-8 bg-slate-200 dark:bg-slate-700 rounded" />
          <div className="flex-1 h-3 bg-slate-200 dark:bg-slate-700 rounded" />
          <div className="h-3 w-16 bg-slate-200 dark:bg-slate-700 rounded" />
        </div>
      ))}
    </div>
  </div>
);

export default Dashboard;
