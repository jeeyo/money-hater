import React from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import type { BudgetWithStats } from '../types';

interface BudgetCardProps {
  budget: BudgetWithStats;
  onEdit: (budget: BudgetWithStats) => void;
  onDelete: (id: string) => void;
}

import { useNavigate } from 'react-router-dom';

const BudgetCard: React.FC<BudgetCardProps> = ({ budget, onEdit, onDelete }) => {
  const navigate = useNavigate();
  const [now] = React.useState(() => Date.now());
  const percent = Math.min((budget.spent / budget.amount) * 100, 100);
  const isOverBudget = budget.spent > budget.amount;
  const daysLeft = Math.ceil((new Date(budget.endDate).getTime() - now) / (1000 * 60 * 60 * 24));
  const isExpired = daysLeft < 0;

  return (
    <div
      onClick={() => navigate(`/budgets/${budget.id}`)}
      className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 shadow-sm cursor-pointer hover:border-indigo-500 dark:hover:border-indigo-500 transition-all"
    >
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="font-semibold text-lg text-slate-900 dark:text-white">{budget.name}</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {new Date(budget.startDate).toLocaleDateString()} -{' '}
            {new Date(budget.endDate).toLocaleDateString()}
          </p>
        </div>
        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => onEdit(budget)}
            className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-slate-700 rounded-full transition-colors"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            onClick={() => onDelete(budget.id)}
            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-slate-700 rounded-full transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="mb-4">
        <div className="flex justify-between text-sm mb-1">
          <span className="text-slate-600 dark:text-slate-400">
            Spent: ฿{budget.spent.toLocaleString()}
          </span>
          <span className="font-medium text-slate-900 dark:text-white">
            Limit: ฿{budget.amount.toLocaleString()}
          </span>
        </div>
        <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-3 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${isOverBudget ? 'bg-red-500' : 'bg-emerald-500'}`}
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      <div className="flex justify-between items-center text-sm">
        <div className="flex flex-col">
          <span className="text-xs text-slate-500 dark:text-slate-400">Remaining</span>
          <span className={`font-semibold ${isOverBudget ? 'text-red-600' : 'text-emerald-600'}`}>
            {isOverBudget ? '-' : ''}฿{Math.abs(budget.amount - budget.spent).toLocaleString()}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {isExpired ? (
            <span className="text-slate-400 text-xs bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded">
              Expired
            </span>
          ) : (
            <span className="text-slate-500 dark:text-slate-400 text-xs">{daysLeft} days left</span>
          )}
        </div>
      </div>

      {/* Category/Tags Badges */}
      <div className="mt-4 flex flex-wrap gap-1">
        {budget.categories.slice(0, 3).map((cat) => (
          <span
            key={cat}
            className="px-2 py-0.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-[10px] rounded-full border border-indigo-100 dark:border-indigo-800"
          >
            {cat}
          </span>
        ))}
        {budget.categories.length > 3 && (
          <span className="px-2 py-0.5 bg-slate-50 dark:bg-slate-800 text-slate-500 text-[10px] rounded-full">
            +{budget.categories.length - 3}
          </span>
        )}
      </div>
    </div>
  );
};

export default BudgetCard;
