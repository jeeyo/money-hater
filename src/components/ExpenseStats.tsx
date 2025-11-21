import React, { useMemo, useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import type { Expense } from '../types';
import { TrendingUp, DollarSign, Calendar, Filter, ChevronDown } from 'lucide-react';

interface ExpenseStatsProps {
  expenses: Expense[];
}

const COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316',
  '#eab308', '#84cc16', '#10b981', '#06b6d4', '#0ea5e9',
  '#3b82f6', '#64748b'
];

const ExpenseStats: React.FC<ExpenseStatsProps> = ({ expenses }) => {
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [summaryPeriod, setSummaryPeriod] = useState<'month' | 'year'>('month');

  const totalAmount = useMemo(() => expenses.reduce((sum, item) => sum + item.amount, 0), [expenses]);

  // Get unique months from expenses for the filter dropdown
  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    expenses.forEach(exp => {
      if (exp.date && exp.date.length >= 7) {
        months.add(exp.date.substring(0, 7)); // YYYY-MM
      }
    });
    // Sort descending (newest first)
    return Array.from(months).sort().reverse();
  }, [expenses]);

  const categoryData = useMemo(() => {
    // Filter expenses based on selected month
    let filteredExpenses = expenses;
    if (selectedMonth !== 'all') {
      filteredExpenses = expenses.filter(e => e.date.startsWith(selectedMonth));
    }

    const map = new Map<string, number>();
    filteredExpenses.forEach(exp => {
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
      .filter(e => {
        if (!e.date) return false;
        const [year, month] = e.date.split('-').map(Number);

        if (summaryPeriod === 'month') {
          return year === currentYear && month === currentMonth;
        } else {
          return year === currentYear;
        }
      })
      .reduce((sum, e) => sum + e.amount, 0);
  }, [expenses, summaryPeriod]);

  const formatMonth = (monthStr: string) => {
    const [year, month] = monthStr.split('-').map(Number);
    const date = new Date(year, month - 1);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
      {/* Summary Cards */}
      <div className="lg:col-span-1 space-y-4">
        <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-6 rounded-2xl text-white shadow-lg shadow-indigo-200">
          <div className="flex items-center gap-3 mb-2 opacity-90">
            <DollarSign className="w-5 h-5" />
            <span className="font-medium">Total Spend</span>
          </div>
          <div className="text-4xl font-bold tracking-tight">
            ฿{totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="mt-4 text-indigo-100 text-sm flex items-center gap-1">
            <TrendingUp className="w-4 h-4" />
            <span>Lifetime expenses tracked</span>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-3 mb-2 text-slate-500">
            <Calendar className="w-5 h-5" />
            <div className="relative">
              <select
                value={summaryPeriod}
                onChange={(e) => setSummaryPeriod(e.target.value as 'month' | 'year')}
                className="appearance-none bg-transparent font-medium text-slate-600 hover:text-indigo-600 cursor-pointer outline-none pr-5 py-1"
              >
                <option value="month">This Month</option>
                <option value="year">This Year</option>
              </select>
              <ChevronDown className="w-3 h-3 absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" />
            </div>
          </div>
          <div className="text-3xl font-bold text-slate-800">
            ฿{currentPeriodTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-slate-800">Spending by Category</h3>

          <div className="relative">
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="appearance-none bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-sm rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent block w-full pl-3 pr-8 py-2 outline-none cursor-pointer font-medium transition-colors"
            >
              <option value="all">All Time</option>
              {availableMonths.map(month => (
                <option key={month} value={month}>
                  {formatMonth(month)}
                </option>
              ))}
            </select>
            <Filter className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
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
                  {categoryData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number) => [`฿${value.toFixed(2)}`, 'Amount']}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Legend layout="vertical" align="right" verticalAlign="middle" />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
              <p>No expenses found for this period</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ExpenseStats;
