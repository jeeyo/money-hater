import React, { useMemo, useState, useEffect } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import type { Expense } from '../types'; // Keeping Expense as it's used in ExpenseStatsProps
import { TrendingUp, TrendingDown, Calendar, Filter, ChevronDown, Wallet } from 'lucide-react';

interface ExpenseStatsProps {
  expenses: Expense[];
}

const COLORS = [
  '#6366f1',
  '#8b5cf6',
  '#ec4899',
  '#f43f5e',
  '#f97316',
  '#eab308',
  '#84cc16',
  '#10b981',
  '#06b6d4',
  '#0ea5e9',
  '#3b82f6',
  '#64748b',
];

const ExpenseStats: React.FC<ExpenseStatsProps> = ({ expenses }) => {
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [summaryPeriod, setSummaryPeriod] = useState<'month' | 'year'>('month');

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

  // Get unique months from expenses for the filter dropdown
  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    expenses.forEach((exp) => {
      if (exp.date && exp.date.length >= 7) {
        months.add(exp.date.substring(0, 7)); // YYYY-MM
      }
    });
    // Sort descending (newest first)
    return Array.from(months).sort().reverse();
  }, [expenses]);

  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const categoryData = useMemo(() => {
    // Filter expenses based on selected month
    let filteredExpenses = expenses;
    if (selectedMonth !== 'all') {
      filteredExpenses = expenses.filter((e) => e.date.startsWith(selectedMonth));
    }

    // Only show expenses in the pie chart for now
    filteredExpenses = filteredExpenses.filter((e) => e.type !== 'income');

    const map = new Map<string, number>();
    filteredExpenses.forEach((exp) => {
      map.set(exp.category, (map.get(exp.category) || 0) + exp.amount);
    });

    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value); // Sort desc
  }, [expenses, selectedMonth]);

  const currentPeriodTotal = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // 1-12

    return expenses
      .filter((e) => {
        if (!e.date) return false;
        const [year, month] = e.date.split('-').map(Number);

        if (summaryPeriod === 'month') {
          return year === currentYear && month === currentMonth;
        } else {
          return year === currentYear;
        }
      })
      .reduce(
        (acc, e) => {
          if (e.type === 'income') {
            acc.income += e.amount;
            acc.expense += 0;
          } else {
            acc.income += 0;
            acc.expense += e.amount;
          }
          return acc;
        },
        { income: 0, expense: 0 },
      );
  }, [expenses, summaryPeriod]);

  const formatMonth = (monthStr: string) => {
    const [year, month] = monthStr.split('-').map(Number);
    const date = new Date(year, month - 1);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
      {/* Summary Cards */}
      <div className="lg:col-span-1 space-y-3">
        <div className="bg-indigo-600 dark:bg-indigo-500 p-4 rounded-xl text-white shadow-sm">
          <div className="flex items-center gap-2 mb-1.5 opacity-90">
            <Wallet className="w-4 h-4" />
            <span className="font-medium text-sm">Net Balance</span>
          </div>
          <div className="text-3xl font-semibold tracking-tight">
            ฿
            {netBalance.toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </div>
          <div className="mt-3 text-indigo-100 text-xs flex items-center gap-3">
            <div className="flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5 text-green-200" />
              <span>+฿{totalIncome.toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-1">
              <TrendingDown className="w-3.5 h-3.5 text-red-200" />
              <span>-฿{totalExpense.toLocaleString()}</span>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm transition-colors">
          <div className="flex items-center gap-2 mb-1.5 text-slate-500 dark:text-slate-400">
            <Calendar className="w-4 h-4" />
            <div className="relative">
              <select
                value={summaryPeriod}
                onChange={(e) => setSummaryPeriod(e.target.value as 'month' | 'year')}
                className="appearance-none bg-transparent font-medium text-sm text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer outline-none pr-4 py-0.5"
              >
                <option value="month">This Month</option>
                <option value="year">This Year</option>
              </select>
              <ChevronDown className="w-3 h-3 absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-1.5">
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mb-0.5">Income</div>
              <div className="text-lg font-semibold text-green-600 dark:text-green-400">
                +฿{currentPeriodTotal.income.toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mb-0.5">Expense</div>
              <div className="text-lg font-semibold text-red-600 dark:text-red-400">
                -฿{currentPeriodTotal.expense.toLocaleString()}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="lg:col-span-2 bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col transition-colors">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold text-slate-800 dark:text-white">
            Spending by Category
          </h3>

          <div className="relative">
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="appearance-none bg-slate-50 dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 text-xs rounded-lg focus:ring-2 focus:ring-indigo-400 dark:focus:ring-indigo-500 focus:border-transparent block w-full pl-2.5 pr-7 py-1.5 outline-none cursor-pointer font-medium transition-colors"
            >
              <option value="all">All Time</option>
              {availableMonths.map((month) => (
                <option key={month} value={month}>
                  {formatMonth(month)}
                </option>
              ))}
            </select>
            <Filter className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          </div>
        </div>

        <div className="flex-1 min-h-[250px]">
          {categoryData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={categoryData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {categoryData.map((_, index) => (
                    <Cell key={`cell - ${index} `} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number) => [`฿${value.toFixed(2)} `, 'Amount']}
                  contentStyle={{
                    borderRadius: '12px',
                    border: 'none',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                    backgroundColor: 'var(--tooltip-bg, #fff)',
                    color: 'var(--tooltip-text, #1e293b)',
                  }}
                />
                <Legend
                  layout={isMobile ? 'horizontal' : 'vertical'}
                  align={isMobile ? 'center' : 'right'}
                  verticalAlign={isMobile ? 'bottom' : 'middle'}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-dashed border-slate-200 dark:border-slate-700">
              <p className="text-sm">No expenses found for this period</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ExpenseStats;
