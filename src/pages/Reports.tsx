import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from 'recharts';
import { Download, TrendingUp, TrendingDown, Wallet, PiggyBank } from 'lucide-react';
import Layout from '../components/Layout';
import { useAccount } from '../context/useAccount';
import { useExpenses } from '../hooks/useExpenses';
import type { Expense } from '../types';

type Preset = '30d' | '90d' | 'ytd' | '12m' | 'custom';

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

const todayIso = () => new Date().toISOString().slice(0, 10);
const isoNDaysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};
const isoStartOfYear = () => {
  const d = new Date();
  return new Date(d.getFullYear(), 0, 1).toISOString().slice(0, 10);
};
const isoNMonthsAgo = (n: number) => {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d.toISOString().slice(0, 10);
};

const presetRange = (preset: Preset): { from: string; to: string } | null => {
  switch (preset) {
    case '30d':
      return { from: isoNDaysAgo(30), to: todayIso() };
    case '90d':
      return { from: isoNDaysAgo(90), to: todayIso() };
    case 'ytd':
      return { from: isoStartOfYear(), to: todayIso() };
    case '12m':
      return { from: isoNMonthsAgo(12), to: todayIso() };
    case 'custom':
      return null;
  }
};

const monthKey = (iso: string) => iso.slice(0, 7); // YYYY-MM
const monthLabel = (key: string) => {
  const [y, m] = key.split('-');
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleString(undefined, { month: 'short', year: '2-digit' });
};

const csvEscape = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const exportCsv = (rows: Expense[]) => {
  const header = ['date', 'description', 'amount', 'type', 'category', 'tags'];
  const body = rows.map((r) =>
    [r.date, r.description, r.amount, r.type, r.category, (r.tags ?? []).join('|')]
      .map(csvEscape)
      .join(','),
  );
  const csv = [header.join(','), ...body].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `report-${todayIso()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const Reports: React.FC = () => {
  const { selectedAccount, isLoading: isAccountLoading } = useAccount();
  const [preset, setPreset] = useState<Preset>('90d');
  const [customFrom, setCustomFrom] = useState(isoNDaysAgo(30));
  const [customTo, setCustomTo] = useState(todayIso());

  const range =
    preset === 'custom'
      ? { from: customFrom, to: customTo }
      : (presetRange(preset) as { from: string; to: string });

  const expensesQuery = useExpenses(
    selectedAccount ? { accountId: selectedAccount.id, from: range.from, to: range.to } : undefined,
    { enabled: !!selectedAccount },
  );
  const expenses = useMemo(() => expensesQuery.data ?? [], [expensesQuery.data]);
  const isLoading = isAccountLoading || (!!selectedAccount && expensesQuery.isLoading);

  const stats = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const e of expenses) {
      if (e.type === 'income') income += e.amount;
      else expense += e.amount;
    }
    const net = income - expense;
    const savingsRate = income > 0 ? (net / income) * 100 : 0;
    return { income, expense, net, savingsRate };
  }, [expenses]);

  const monthlySeries = useMemo(() => {
    const byMonth = new Map<string, { income: number; expense: number }>();
    for (const e of expenses) {
      const k = monthKey(e.date);
      const prev = byMonth.get(k) ?? { income: 0, expense: 0 };
      if (e.type === 'income') prev.income += e.amount;
      else prev.expense += e.amount;
      byMonth.set(k, prev);
    }
    return Array.from(byMonth.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, v]) => ({ month: monthLabel(k), income: v.income, expense: v.expense }));
  }, [expenses]);

  const categoryBreakdown = useMemo(() => {
    const byCat = new Map<string, number>();
    for (const e of expenses) {
      if (e.type !== 'expense') continue;
      byCat.set(e.category, (byCat.get(e.category) ?? 0) + e.amount);
    }
    return Array.from(byCat.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [expenses]);

  const topTags = useMemo(() => {
    const byTag = new Map<string, number>();
    for (const e of expenses) {
      if (e.type !== 'expense') continue;
      for (const t of e.tags ?? []) {
        byTag.set(t, (byTag.get(t) ?? 0) + e.amount);
      }
    }
    return Array.from(byTag.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [expenses]);

  const topExpenses = useMemo(
    () =>
      [...expenses]
        .filter((e) => e.type === 'expense')
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 10),
    [expenses],
  );

  const presetOptions: Array<{ id: Preset; label: string }> = [
    { id: '30d', label: 'Last 30 days' },
    { id: '90d', label: 'Last 90 days' },
    { id: 'ytd', label: 'Year to date' },
    { id: '12m', label: 'Last 12 months' },
    { id: 'custom', label: 'Custom' },
  ];

  return (
    <Layout>
      <div className="pb-16">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Reports</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Insights for {range.from} → {range.to}
            </p>
          </div>
          <button
            type="button"
            onClick={() => exportCsv(expenses)}
            disabled={expenses.length === 0}
            className="inline-flex items-center gap-2 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-400 dark:disabled:bg-slate-700 text-white text-sm rounded-lg transition-colors"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>

        {/* Range picker */}
        <fieldset className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 mb-6">
          <legend className="px-2 text-sm font-medium text-slate-700 dark:text-slate-300">
            Date range
          </legend>
          <div className="flex flex-wrap gap-2 mb-3">
            {presetOptions.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setPreset(opt.id)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  preset === opt.id
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {preset === 'custom' && (
            <div className="flex flex-wrap gap-3">
              <label className="flex flex-col text-xs text-slate-600 dark:text-slate-400">
                From
                <input
                  type="date"
                  value={customFrom}
                  max={customTo}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="mt-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </label>
              <label className="flex flex-col text-xs text-slate-600 dark:text-slate-400">
                To
                <input
                  type="date"
                  value={customTo}
                  min={customFrom}
                  max={todayIso()}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="mt-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </label>
            </div>
          )}
        </fieldset>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-24 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 animate-pulse"
              />
            ))}
          </div>
        ) : (
          <>
            {/* KPI tiles */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <KpiTile
                label="Income"
                value={`฿${stats.income.toFixed(0)}`}
                icon={<TrendingUp className="w-4 h-4 text-green-600 dark:text-green-400" />}
              />
              <KpiTile
                label="Expense"
                value={`฿${stats.expense.toFixed(0)}`}
                icon={<TrendingDown className="w-4 h-4 text-rose-600 dark:text-rose-400" />}
              />
              <KpiTile
                label="Net"
                value={`฿${stats.net.toFixed(0)}`}
                icon={<Wallet className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />}
                tone={stats.net >= 0 ? 'positive' : 'negative'}
              />
              <KpiTile
                label="Savings rate"
                value={`${stats.savingsRate.toFixed(1)}%`}
                icon={<PiggyBank className="w-4 h-4 text-amber-600 dark:text-amber-400" />}
                tone={stats.savingsRate >= 0 ? 'positive' : 'negative'}
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
              {/* Income vs Expense over time */}
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                <h2 className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-3">
                  Income vs Expense
                </h2>
                {monthlySeries.length === 0 ? (
                  <EmptyChart />
                ) : (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={monthlySeries}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.2} />
                        <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                        <YAxis tick={{ fontSize: 12 }} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'rgba(15,23,42,0.9)',
                            border: 'none',
                            borderRadius: 8,
                            color: '#fff',
                          }}
                          formatter={(v: number) => `฿${v.toFixed(0)}`}
                        />
                        <Legend />
                        <Line
                          type="monotone"
                          dataKey="income"
                          name="Income"
                          stroke="#10b981"
                          strokeWidth={2}
                        />
                        <Line
                          type="monotone"
                          dataKey="expense"
                          name="Expense"
                          stroke="#f43f5e"
                          strokeWidth={2}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              {/* Spending by Category */}
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                <h2 className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-3">
                  Spending by Category
                </h2>
                {categoryBreakdown.length === 0 ? (
                  <EmptyChart />
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={categoryBreakdown}
                            dataKey="value"
                            nameKey="name"
                            innerRadius={45}
                            outerRadius={75}
                            paddingAngle={2}
                          >
                            {categoryBreakdown.map((_, i) => (
                              <Cell key={i} fill={COLORS[i % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{
                              backgroundColor: 'rgba(15,23,42,0.9)',
                              border: 'none',
                              borderRadius: 8,
                              color: '#fff',
                            }}
                            formatter={(v: number) => `฿${v.toFixed(0)}`}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <ul className="space-y-1.5 text-sm">
                      {categoryBreakdown.slice(0, 6).map((c, i) => {
                        const pct = stats.expense > 0 ? (c.value / stats.expense) * 100 : 0;
                        return (
                          <li key={c.name} className="flex items-center gap-2">
                            <span
                              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                              style={{ backgroundColor: COLORS[i % COLORS.length] }}
                              aria-hidden="true"
                            />
                            <span className="flex-1 truncate text-slate-700 dark:text-slate-300">
                              {c.name}
                            </span>
                            <span className="text-slate-500 dark:text-slate-400 tabular-nums">
                              {pct.toFixed(0)}%
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
              {/* Top tags */}
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                <h2 className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-3">
                  Top tags by spend
                </h2>
                {topTags.length === 0 ? (
                  <EmptyChart />
                ) : (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={topTags} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.2} />
                        <XAxis type="number" tick={{ fontSize: 12 }} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={100} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'rgba(15,23,42,0.9)',
                            border: 'none',
                            borderRadius: 8,
                            color: '#fff',
                          }}
                          formatter={(v: number) => `฿${v.toFixed(0)}`}
                        />
                        <Bar dataKey="value" fill="#6366f1" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              {/* Top expenses */}
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                <h2 className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-3">
                  Top 10 expenses
                </h2>
                {topExpenses.length === 0 ? (
                  <EmptyChart />
                ) : (
                  <ol className="space-y-2 text-sm">
                    {topExpenses.map((e, i) => (
                      <li
                        key={e.id}
                        className="flex items-center gap-2 py-1.5 border-b border-slate-100 dark:border-slate-700 last:border-0"
                      >
                        <span className="w-5 text-right text-xs text-slate-400 tabular-nums">
                          {i + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="truncate text-slate-900 dark:text-white">
                            {e.description}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            {e.date} · {e.category}
                          </div>
                        </div>
                        <div className="text-rose-600 dark:text-rose-400 tabular-nums">
                          ฿{e.amount.toFixed(0)}
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
};

const KpiTile: React.FC<{
  label: string;
  value: string;
  icon: React.ReactNode;
  tone?: 'positive' | 'negative';
}> = ({ label, value, icon, tone }) => (
  <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
    <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-2">
      {icon}
      <span>{label}</span>
    </div>
    <div
      className={`text-2xl font-bold tabular-nums ${
        tone === 'positive'
          ? 'text-green-600 dark:text-green-400'
          : tone === 'negative'
            ? 'text-rose-600 dark:text-rose-400'
            : 'text-slate-900 dark:text-white'
      }`}
    >
      {value}
    </div>
  </div>
);

const EmptyChart: React.FC = () => (
  <div className="h-64 flex items-center justify-center text-sm text-slate-400 dark:text-slate-500">
    No data for this range
  </div>
);

export default Reports;
