import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Plus, TrendingUp, TrendingDown, ArrowLeftRight, Sparkles } from 'lucide-react';
import { LineChart, Line, ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
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

const CHART_COLORS = ['#f59e0b', '#14b8a6', '#8b5cf6', '#10b981', '#f43f5e', '#60a5fa'];

function useCountUp(target: number, duration = 900, enabled = true) {
  const [value, setValue] = useState(0);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!enabled) return;
    startRef.current = null;
    const animate = (ts: number) => {
      if (startRef.current === null) startRef.current = ts;
      const elapsed = ts - startRef.current;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(target * eased);
      if (progress < 1) rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration, enabled]);

  return value;
}

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
  const [dataReady, setDataReady] = useState(false);

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
    if (!isLoading && expenses.length >= 0) {
      const timer = setTimeout(() => setDataReady(true), 100);
      return () => clearTimeout(timer);
    }
  }, [isLoading, expenses.length]);

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

  const handleEditClick = useCallback((expense: Expense) => {
    setEditingExpense(expense);
    setIsFormOpen(true);
  }, []);

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
      .slice(0, 5);
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

  const animatedBalance = useCountUp(Math.abs(netBalance), 900, dataReady);
  const animatedIncome = useCountUp(currentMonthStats.income, 800, dataReady);
  const animatedExpense = useCountUp(currentMonthStats.expense, 850, dataReady);

  return (
    <Layout>
      {isLoading ? (
        <DashboardSkeleton />
      ) : (
        <div className="space-y-4 max-w-7xl mx-auto">
          {/* ── Top Stats Row ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {/* Hero — Net Balance */}
            <div
              className="relative overflow-hidden rounded-2xl border border-white/6 p-5 sm:p-6 card-hover card-highlight
                animate-fade-in-up"
              style={{
                background: 'linear-gradient(135deg, #0f1929 0%, #0b1120 60%, #060d1a 100%)',
              }}
            >
              {/* Ambient glow */}
              <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-amber-500/10 blur-2xl pointer-events-none" />
              <div className="absolute -bottom-8 -left-8 w-24 h-24 rounded-full bg-teal-500/8 blur-2xl pointer-events-none" />

              <div className="relative">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(245,158,11,0.8)]" />
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest">
                    Net Balance
                  </span>
                </div>

                <div className="flex items-start gap-1 mb-2">
                  <span className="text-amber-400 font-display font-bold text-2xl mt-1">฿</span>
                  <span
                    className={`font-display font-bold text-4xl sm:text-5xl tabular-nums leading-none
                      ${netBalance < 0 ? 'text-rose-400' : 'text-white'}`}
                  >
                    {animatedBalance.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                  </span>
                </div>
                {netBalance < 0 && (
                  <span className="text-[10px] text-rose-500 font-medium">in the red</span>
                )}

                <div className="flex items-center gap-4 mt-3 mb-5">
                  <div className="flex items-center gap-1.5 text-xs">
                    <TrendingUp className="w-3.5 h-3.5 text-income" />
                    <span className="text-income font-medium">+฿{totalIncome.toFixed(0)}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs">
                    <TrendingDown className="w-3.5 h-3.5 text-expense" />
                    <span className="text-expense font-medium">-฿{totalExpense.toFixed(0)}</span>
                  </div>
                </div>

                {/* Sparkline */}
                <div className="h-16 -mx-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <Line
                        type="monotone"
                        dataKey="income"
                        stroke="#10b981"
                        strokeWidth={1.5}
                        dot={false}
                        strokeOpacity={0.8}
                      />
                      <Line
                        type="monotone"
                        dataKey="expense"
                        stroke="#f43f5e"
                        strokeWidth={1.5}
                        dot={false}
                        strokeOpacity={0.8}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Spending by Category */}
            <div
              className="relative overflow-hidden rounded-2xl border border-white/6 p-5 card-hover card-highlight
                animate-fade-in-up animate-delay-100"
              style={{ background: '#0b1120' }}
            >
              <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-teal-500/8 blur-2xl pointer-events-none" />

              <div className="relative">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-teal-400" />
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest">
                    By Category
                  </span>
                </div>

                <div className="flex items-center gap-4">
                  <div className="w-28 h-28 shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={
                            categoryData.length > 0 ? categoryData : [{ name: 'No data', value: 1 }]
                          }
                          cx="50%"
                          cy="50%"
                          innerRadius={30}
                          outerRadius={50}
                          paddingAngle={3}
                          dataKey="value"
                          stroke="none"
                        >
                          {(categoryData.length > 0
                            ? categoryData
                            : [{ name: 'No data', value: 1 }]
                          ).map((_, index) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={CHART_COLORS[index % CHART_COLORS.length]}
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            background: '#0f1929',
                            border: '1px solid rgba(255,255,255,0.08)',
                            borderRadius: '8px',
                            fontSize: '11px',
                          }}
                          formatter={(val: number) => [`฿${val.toFixed(0)}`, '']}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="flex-1 space-y-2 min-w-0">
                    {categoryData.slice(0, 4).map((cat, idx) => (
                      <div key={cat.name} className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div
                            className="w-1.5 h-1.5 rounded-full shrink-0"
                            style={{ backgroundColor: CHART_COLORS[idx] }}
                          />
                          <span className="text-slate-400 text-xs truncate">{cat.name}</span>
                        </div>
                        <span
                          className="text-slate-300 text-xs tabular-nums font-medium shrink-0"
                          style={{ color: CHART_COLORS[idx] }}
                        >
                          ฿{cat.value.toFixed(0)}
                        </span>
                      </div>
                    ))}
                    {categoryData.length === 0 && (
                      <p className="text-xs text-slate-600 italic">No expenses yet</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* This Month */}
            <div
              className="relative overflow-hidden rounded-2xl border border-white/6 p-5 card-hover card-highlight
                sm:col-span-2 lg:col-span-1
                animate-fade-in-up animate-delay-200"
              style={{ background: '#0b1120' }}
            >
              <div className="absolute -bottom-6 -right-6 w-24 h-24 rounded-full bg-amber-500/6 blur-2xl pointer-events-none" />

              <div className="relative">
                <div className="flex items-center gap-2 mb-4">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest">
                    This Month
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4 sm:gap-6">
                  <div>
                    <div className="text-[10px] font-medium text-slate-600 uppercase tracking-wider mb-1.5">
                      Income
                    </div>
                    <div className="text-income font-display font-bold text-2xl sm:text-3xl tabular-nums leading-none">
                      {animatedIncome.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                    </div>
                    <div className="text-xs text-income/60 mt-1">฿ earned</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-medium text-slate-600 uppercase tracking-wider mb-1.5">
                      Spent
                    </div>
                    <div className="text-expense font-display font-bold text-2xl sm:text-3xl tabular-nums leading-none">
                      {animatedExpense.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                    </div>
                    <div className="text-xs text-expense/60 mt-1">฿ out</div>
                  </div>
                </div>

                {/* Savings rate bar */}
                {currentMonthStats.income > 0 && (
                  <div className="mt-5">
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-[10px] text-slate-600 uppercase tracking-wider">
                        Savings rate
                      </span>
                      <span className="text-[10px] font-medium text-teal-400">
                        {Math.max(
                          0,
                          Math.round(
                            ((currentMonthStats.income - currentMonthStats.expense) /
                              currentMonthStats.income) *
                              100,
                          ),
                        )}
                        %
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-1000"
                        style={{
                          width: `${Math.min(100, Math.max(0, ((currentMonthStats.income - currentMonthStats.expense) / currentMonthStats.income) * 100))}%`,
                          background: 'linear-gradient(90deg, #14b8a6, #10b981)',
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Recent Transactions ── */}
          <div
            className="rounded-2xl border border-white/6 overflow-hidden card-highlight
              animate-fade-in-up animate-delay-300"
            style={{ background: '#0b1120' }}
          >
            {/* Header */}
            <div className="px-4 sm:px-5 py-4 border-b border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center">
                  <ArrowLeftRight className="w-3.5 h-3.5 text-amber-400" />
                </div>
                <h2 className="font-display font-bold text-white text-base">Transactions</h2>
              </div>
              <span className="text-[10px] font-medium text-slate-600 uppercase tracking-wider">
                Recent
              </span>
            </div>

            {recentTransactions.length === 0 ? (
              <div className="py-16 text-center">
                <div className="w-12 h-12 rounded-2xl bg-white/4 flex items-center justify-center mx-auto mb-3">
                  <ArrowLeftRight className="w-5 h-5 text-slate-600" />
                </div>
                <p className="text-slate-600 text-sm">No transactions yet</p>
                <p className="text-slate-700 text-xs mt-1">Tap + to add your first one</p>
              </div>
            ) : (
              <div>
                {recentTransactions.map((transaction, i) => (
                  <TransactionRow
                    key={transaction.id}
                    transaction={transaction}
                    onClick={handleEditClick}
                    index={i}
                  />
                ))}
              </div>
            )}
          </div>

          {/* ── FAB ── */}
          <button
            type="button"
            onClick={() => {
              setEditingExpense(null);
              setIsFormOpen(true);
            }}
            aria-label="Add new transaction"
            className="fixed right-5 bottom-[5.5rem] md:bottom-8 md:right-8 z-40
              w-14 h-14 rounded-2xl text-bg
              flex items-center justify-center
              shadow-xl transition-all duration-200
              hover:scale-110 hover:rotate-12 active:scale-95
              animate-fade-in animate-delay-500"
            style={{
              background: 'linear-gradient(135deg, #f59e0b, #d97706)',
              boxShadow: '0 8px 32px rgba(245,158,11,0.4), 0 0 0 1px rgba(245,158,11,0.2)',
            }}
          >
            <Plus className="w-6 h-6" strokeWidth={2.5} />
          </button>

          {/* ── Modal ── */}
          {isFormOpen && (
            <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
              <div
                className="absolute inset-0 bg-bg/85 backdrop-blur-md"
                onClick={handleCloseForm}
                aria-hidden="true"
              />
              <div
                className="relative w-full max-w-lg sm:max-h-[90vh] rounded-t-2xl sm:rounded-2xl
                  overflow-y-auto animate-scale-in"
                style={{ background: '#0b1120', border: '1px solid rgba(255,255,255,0.07)' }}
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

interface TransactionRowProps {
  transaction: Expense;
  onClick: (t: Expense) => void;
  index: number;
}

const TransactionRow: React.FC<TransactionRowProps> = ({ transaction, onClick, index }) => {
  return (
    <div
      className="flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3.5 border-b border-white/4 last:border-0
        hover:bg-white/2 cursor-pointer transition-all duration-150 group
        animate-fade-in-up"
      style={{ animationDelay: `${(index + 4) * 60}ms` }}
      onClick={() => onClick(transaction)}
    >
      {/* Icon */}
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-150 group-hover:scale-105"
        style={{
          background:
            transaction.type === 'income' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(244, 63, 94, 0.10)',
        }}
      >
        {getCategoryIcon(transaction.category)}
      </div>

      {/* Description */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-200 truncate group-hover:text-white transition-colors">
          {transaction.description}
        </p>
        <p className="text-[11px] text-slate-600 mt-0.5">
          {new Date(transaction.date).toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          })}
          {transaction.category && (
            <span className="ml-2 text-slate-700">· {transaction.category}</span>
          )}
        </p>
      </div>

      {/* Amount */}
      <div className="text-right shrink-0">
        <span
          className={`text-sm font-bold tabular-nums font-mono ${
            transaction.type === 'income' ? 'text-income' : 'text-expense'
          }`}
        >
          {transaction.type === 'income' ? '+' : '−'}฿{transaction.amount.toFixed(2)}
        </span>
      </div>
    </div>
  );
};

const DashboardSkeleton: React.FC = () => (
  <div className="space-y-4 max-w-7xl mx-auto" aria-hidden="true">
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="rounded-2xl border border-white/5 p-5 h-52"
          style={{ background: '#0b1120' }}
        >
          <div className="skeleton h-2.5 w-20 rounded-full mb-5" />
          <div className="skeleton h-10 w-40 rounded-xl mb-3" />
          <div className="skeleton h-3 w-32 rounded-full mb-4" />
          <div className="skeleton h-14 rounded-xl" />
        </div>
      ))}
    </div>
    <div className="rounded-2xl border border-white/5" style={{ background: '#0b1120' }}>
      <div className="px-5 py-4 border-b border-white/5">
        <div className="skeleton h-4 w-32 rounded-full" />
      </div>
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 px-5 py-3.5 border-b border-white/4 last:border-0"
        >
          <div className="skeleton w-9 h-9 rounded-xl shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="skeleton h-3 w-3/5 rounded-full" />
            <div className="skeleton h-2 w-1/4 rounded-full" />
          </div>
          <div className="skeleton h-4 w-16 rounded-full" />
        </div>
      ))}
    </div>
  </div>
);

export default Dashboard;
