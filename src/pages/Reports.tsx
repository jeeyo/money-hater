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
import { Download, TrendingUp, TrendingDown, Wallet, PiggyBank, BarChart3 } from 'lucide-react';
import Layout from '../components/Layout';
import { useAccount } from '../context/useAccount';
import { useExpenses } from '../hooks/useExpenses';
import type { Expense } from '../types';

type Preset = '30d' | '90d' | 'ytd' | '12m' | 'custom';

const COLORS = [
  '#7c3aed', '#6366f1', '#22d3ee', '#10b981',
  '#f59e0b', '#f43f5e', '#8b5cf6', '#ec4899',
];

const todayIso = () => new Date().toISOString().slice(0, 10);
const isoNDaysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
const isoStartOfYear = () => { const d = new Date(); return new Date(d.getFullYear(), 0, 1).toISOString().slice(0, 10); };
const isoNMonthsAgo = (n: number) => { const d = new Date(); d.setMonth(d.getMonth() - n); return d.toISOString().slice(0, 10); };

const presetRange = (preset: Preset): { from: string; to: string } | null => {
  switch (preset) {
    case '30d': return { from: isoNDaysAgo(30), to: todayIso() };
    case '90d': return { from: isoNDaysAgo(90), to: todayIso() };
    case 'ytd': return { from: isoStartOfYear(), to: todayIso() };
    case '12m': return { from: isoNMonthsAgo(12), to: todayIso() };
    case 'custom': return null;
  }
};

const monthKey = (iso: string) => iso.slice(0, 7);
const monthLabel = (key: string) => {
  const [y, m] = key.split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleString(undefined, { month: 'short', year: '2-digit' });
};

const csvEscape = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const exportCsv = (rows: Expense[]) => {
  const header = ['date', 'description', 'amount', 'type', 'category', 'tags'];
  const body = rows.map((r) =>
    [r.date, r.description, r.amount, r.type, r.category, (r.tags ?? []).join('|')].map(csvEscape).join(','),
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

const tooltipStyle = {
  backgroundColor: 'rgba(15,23,42,0.95)',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 12,
  color: '#fff',
};

const Reports: React.FC = () => {
  const { selectedAccount, isLoading: isAccountLoading } = useAccount();
  const [preset, setPreset] = useState<Preset>('90d');
  const [customFrom, setCustomFrom] = useState(isoNDaysAgo(30));
  const [customTo, setCustomTo] = useState(todayIso());

  const range = preset === 'custom'
    ? { from: customFrom, to: customTo }
    : (presetRange(preset) as { from: string; to: string });

  const expensesQuery = useExpenses(
    selectedAccount ? { accountId: selectedAccount.id, from: range.from, to: range.to } : undefined,
    { enabled: !!selectedAccount },
  );
  const expenses = useMemo(() => expensesQuery.data ?? [], [expensesQuery.data]);
  const isLoading = isAccountLoading || (!!selectedAccount && expensesQuery.isLoading);

  const stats = useMemo(() => {
    let income = 0; let expense = 0;
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
    return Array.from(byCat.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [expenses]);

  const topTags = useMemo(() => {
    const byTag = new Map<string, number>();
    for (const e of expenses) {
      if (e.type !== 'expense') continue;
      for (const t of e.tags ?? []) byTag.set(t, (byTag.get(t) ?? 0) + e.amount);
    }
    return Array.from(byTag.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [expenses]);

  const topExpenses = useMemo(
    () => [...expenses].filter((e) => e.type === 'expense').sort((a, b) => b.amount - a.amount).slice(0, 10),
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
      <div className="pb-16 animate-fade-in-up">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Reports</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {range.from} → {range.to}
            </p>
          </div>
          <button
            type="button"
            onClick={() => exportCsv(expenses)}
            disabled={expenses.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2.5
              bg-gradient-to-r from-violet-600 to-indigo-500
              hover:from-violet-500 hover:to-indigo-400
              disabled:bg-white/5 disabled:text-slate-500 disabled:cursor-not-allowed
              text-white text-sm rounded-xl transition-all shadow-lg shadow-violet-600/20 font-medium"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>

        {/* Range picker */}
        <fieldset className="bg-[#1e293b] rounded-2xl border border-white/5 p-5 mb-6">
          <legend className="px-1 text-sm font-medium text-slate-300">Date range</legend>
          <div className="flex flex-wrap gap-2 mb-3">
            {presetOptions.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setPreset(opt.id)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all border ${
                  preset === opt.id
                    ? 'bg-violet-500/15 text-violet-300 border-violet-500/30'
                    : 'bg-white/5 text-slate-400 border-white/8 hover:bg-white/10 hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {preset === 'custom' && (
            <div className="flex flex-wrap gap-4 mt-3 pt-3 border-t border-white/5">
              <label className="flex flex-col text-xs text-slate-400 gap-1.5">
                From
                <input
                  type="date"
                  value={customFrom}
                  max={customTo}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-white/10 bg-white/5 text-white focus:ring-2 focus:ring-violet-500/40 focus:border-violet-500 outline-none [color-scheme:dark]"
                />
              </label>
              <label className="flex flex-col text-xs text-slate-400 gap-1.5">
                To
                <input
                  type="date"
                  value={customTo}
                  min={customFrom}
                  max={todayIso()}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-white/10 bg-white/5 text-white focus:ring-2 focus:ring-violet-500/40 focus:border-violet-500 outline-none [color-scheme:dark]"
                />
              </label>
            </div>
          )}
        </fieldset>

        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-28 bg-[#1e293b] rounded-2xl border border-white/5 skeleton" />
            ))}
          </div>
        ) : (
          <>
            {/* KPI tiles */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <KpiTile label="Income" value={`฿${stats.income.toFixed(0)}`} icon={<TrendingUp className="w-4 h-4 text-emerald-400" />} tone="positive" delay={0} />
              <KpiTile label="Expense" value={`฿${stats.expense.toFixed(0)}`} icon={<TrendingDown className="w-4 h-4 text-rose-400" />} tone="negative" delay={75} />
              <KpiTile label="Net" value={`฿${stats.net.toFixed(0)}`} icon={<Wallet className="w-4 h-4 text-violet-400" />} tone={stats.net >= 0 ? 'positive' : 'negative'} delay={150} />
              <KpiTile label="Savings rate" value={`${stats.savingsRate.toFixed(1)}%`} icon={<PiggyBank className="w-4 h-4 text-cyan-400" />} tone={stats.savingsRate >= 0 ? 'positive' : 'negative'} delay={225} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
              {/* Income vs Expense */}
              <div className="bg-[#1e293b] rounded-2xl border border-white/5 p-5">
                <h2 className="text-sm font-medium text-slate-400 mb-4">Income vs Expense</h2>
                {monthlySeries.length === 0 ? <EmptyChart /> : (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={monthlySeries}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.8} />
                        <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#64748b' }} />
                        <YAxis tick={{ fontSize: 12, fill: '#64748b' }} />
                        <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => `฿${v.toFixed(0)}`} />
                        <Legend />
                        <Line type="monotone" dataKey="income" name="Income" stroke="#10b981" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="expense" name="Expense" stroke="#f43f5e" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              {/* Category Pie */}
              <div className="bg-[#1e293b] rounded-2xl border border-white/5 p-5">
                <h2 className="text-sm font-medium text-slate-400 mb-4">Spending by Category</h2>
                {categoryBreakdown.length === 0 ? <EmptyChart /> : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={categoryBreakdown} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={2}>
                            {categoryBreakdown.map((_, i) => (
                              <Cell key={i} fill={COLORS[i % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => `฿${v.toFixed(0)}`} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <ul className="space-y-2 text-xs">
                      {categoryBreakdown.slice(0, 6).map((c, i) => {
                        const pct = stats.expense > 0 ? (c.value / stats.expense) * 100 : 0;
                        return (
                          <li key={c.name} className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                            <span className="flex-1 truncate text-slate-300">{c.name}</span>
                            <span className="text-slate-500 tabular-nums">{pct.toFixed(0)}%</span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
              {/* Top tags */}
              <div className="bg-[#1e293b] rounded-2xl border border-white/5 p-5">
                <h2 className="text-sm font-medium text-slate-400 mb-4">Top tags by spend</h2>
                {topTags.length === 0 ? <EmptyChart /> : (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={topTags} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.8} />
                        <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} width={100} />
                        <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => `฿${v.toFixed(0)}`} />
                        <Bar dataKey="value" fill="url(#barGradient)" radius={[0, 4, 4, 0]}>
                          <defs>
                            <linearGradient id="barGradient" x1="0" y1="0" x2="1" y2="0">
                              <stop offset="0%" stopColor="#7c3aed" />
                              <stop offset="100%" stopColor="#6366f1" />
                            </linearGradient>
                          </defs>
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              {/* Top 10 expenses */}
              <div className="bg-[#1e293b] rounded-2xl border border-white/5 p-5">
                <h2 className="text-sm font-medium text-slate-400 mb-4">Top 10 expenses</h2>
                {topExpenses.length === 0 ? <EmptyChart /> : (
                  <ol className="space-y-0">
                    {topExpenses.map((e, i) => (
                      <li
                        key={e.id}
                        className="flex items-center gap-3 py-2.5 border-b border-white/5 last:border-0"
                      >
                        <span className="w-5 text-right text-xs text-slate-600 tabular-nums flex-shrink-0">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="truncate text-sm text-white">{e.description}</div>
                          <div className="text-[11px] text-slate-500">{e.date} · {e.category}</div>
                        </div>
                        <div className="text-rose-400 tabular-nums text-sm font-medium flex-shrink-0">
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
  delay?: number;
}> = ({ label, value, icon, tone, delay = 0 }) => (
  <div
    className="bg-gradient-to-br from-[#1e293b] to-[#0f172a] rounded-2xl border border-white/5 p-5 card-hover animate-fade-in-up"
    style={{ animationDelay: `${delay}ms` }}
  >
    <div className="flex items-center justify-between mb-3">
      <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">{label}</span>
      <div className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center">{icon}</div>
    </div>
    <div className={`text-3xl font-bold tabular-nums ${
      tone === 'positive' ? 'text-emerald-400' :
      tone === 'negative' ? 'text-rose-400' : 'text-white'
    }`}>
      {value}
    </div>
  </div>
);

const EmptyChart: React.FC = () => (
  <div className="h-64 flex flex-col items-center justify-center gap-3 text-slate-600">
    <BarChart3 className="w-8 h-8 opacity-30" />
    <p className="text-sm">No data for this range</p>
  </div>
);

export default Reports;
