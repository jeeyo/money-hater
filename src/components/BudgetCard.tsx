import React from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import type { BudgetWithStats } from '../types';
import { useNavigate } from 'react-router-dom';

interface BudgetCardProps {
  budget: BudgetWithStats;
  onEdit: (budget: BudgetWithStats) => void;
  onDelete: (id: string) => void;
  style?: React.CSSProperties;
}

const BudgetCard: React.FC<BudgetCardProps> = ({ budget, onEdit, onDelete, style }) => {
  const navigate = useNavigate();
  const [now] = React.useState(() => Date.now());
  const percent = Math.min((budget.spent / budget.amount) * 100, 100);
  const isOverBudget = budget.spent > budget.amount;
  const isWarning = !isOverBudget && percent > 80;
  const daysLeft = Math.ceil((new Date(budget.endDate).getTime() - now) / (1000 * 60 * 60 * 24));
  const isExpired = daysLeft < 0;

  const statusLabel = isOverBudget ? 'Over Budget' : isWarning ? 'Warning' : 'On Track';
  const statusClass = isOverBudget
    ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
    : isWarning
      ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
      : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';

  const progressClass = isOverBudget
    ? 'progress-danger'
    : isWarning
      ? 'progress-warning'
      : 'progress-gradient';

  const topBorderClass = isOverBudget
    ? 'from-rose-500 to-rose-600'
    : isWarning
      ? 'from-amber-400 to-orange-500'
      : 'from-violet-600 to-indigo-500';

  return (
    <div
      onClick={() => navigate(`/budgets/${budget.id}`)}
      className="bg-[#1e293b] rounded-2xl border border-white/5 card-hover cursor-pointer
        hover:border-violet-500/20 transition-all duration-200 animate-fade-in-up
        flex flex-col overflow-hidden"
      style={style}
    >
      {/* Gradient top strip */}
      <div className={`h-1 bg-gradient-to-r ${topBorderClass}`} />

      <div className="p-5 flex flex-col flex-1">
        <div className="flex justify-between items-start mb-4">
          <div className="min-w-0 flex-1 pr-2">
            <h3 className="font-semibold text-base text-white truncate">{budget.name}</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {new Date(budget.startDate).toLocaleDateString()} –{' '}
              {new Date(budget.endDate).toLocaleDateString()}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full ${statusClass}`}>
              {statusLabel}
            </span>
            <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => onEdit(budget)}
                className="p-2 rounded-xl text-slate-500 hover:text-violet-400 hover:bg-violet-500/10 transition-all"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => onDelete(budget.id)}
                className="p-2 rounded-xl text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Progress */}
        <div className="mb-4">
          <div className="flex justify-between text-xs mb-2">
            <span className="text-slate-400">
              Spent:{' '}
              <span className="text-white font-medium tabular-nums">
                ฿{budget.spent.toLocaleString()}
              </span>
            </span>
            <span className="text-slate-500 tabular-nums">/ ฿{budget.amount.toLocaleString()}</span>
          </div>
          <div className="w-full bg-white/5 rounded-full h-2 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${progressClass}`}
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center text-sm mt-auto">
          <div>
            <span className="text-[11px] text-slate-500 block">Remaining</span>
            <span
              className={`font-semibold tabular-nums ${isOverBudget ? 'text-rose-400' : 'text-emerald-400'}`}
            >
              {isOverBudget ? '-' : ''}฿{Math.abs(budget.amount - budget.spent).toLocaleString()}
            </span>
          </div>
          <div>
            {isExpired ? (
              <span className="text-[11px] px-2.5 py-1 rounded-full bg-white/5 text-slate-500">
                Expired
              </span>
            ) : (
              <span className="text-[11px] text-slate-500">{daysLeft}d left</span>
            )}
          </div>
        </div>

        {/* Category chips */}
        {budget.categories.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {budget.categories.slice(0, 3).map((cat) => (
              <span
                key={cat}
                className="text-[10px] px-2 py-0.5 bg-white/5 text-slate-400 rounded-full border border-white/10"
              >
                {cat}
              </span>
            ))}
            {budget.categories.length > 3 && (
              <span className="text-[10px] px-2 py-0.5 bg-white/5 text-slate-500 rounded-full">
                +{budget.categories.length - 3}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default BudgetCard;
