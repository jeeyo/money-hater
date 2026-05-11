import React from 'react';
import { type Expense } from '../types';
import { Trash2, Edit2, ShoppingBag } from 'lucide-react';
import { getCategoryIcon } from '../utils/categoryIcons';

interface ExpenseListProps {
  expenses: Expense[];
  onDelete: (id: string) => void;
  onEdit: (expense: Expense) => void;
}

const ExpenseList: React.FC<ExpenseListProps> = ({ expenses, onDelete, onEdit }) => {
  if (expenses.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-8 text-center transition-colors">
        <div className="w-12 h-12 bg-slate-50 dark:bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-3 transition-colors">
          <ShoppingBag className="w-6 h-6 text-slate-300 dark:text-slate-500" />
        </div>
        <h3 className="text-base font-medium text-slate-900 dark:text-white">No expenses yet</h3>
        <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">
          Add your first transaction to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm transition-colors">
      <div className="divide-y divide-slate-100 dark:divide-slate-700">
        {expenses.map((expense) => (
          <div
            key={expense.id}
            className="p-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors flex items-center gap-3 group"
          >
            <div className="w-9 h-9 rounded-full bg-slate-50 dark:bg-slate-700 flex items-center justify-center shrink-0 border border-slate-200 dark:border-slate-600 transition-colors">
              {getCategoryIcon(expense.category)}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <h4 className="font-medium text-sm text-slate-800 dark:text-slate-200 truncate">
                  {expense.description}
                </h4>
                <span className="text-xs px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hidden sm:inline-block">
                  {expense.category}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span>{new Date(expense.date).toLocaleDateString()}</span>
                {expense.tags.length > 0 && (
                  <>
                    <span>•</span>
                    <div className="flex gap-1 overflow-hidden">
                      {expense.tags.map((tag) => (
                        <span key={tag} className="text-slate-400 italic">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="text-right flex flex-col items-end">
              <div
                className={`font-semibold text-sm ${expense.type === 'income' ? 'text-green-600 dark:text-green-400' : 'text-slate-900 dark:text-white'}`}
              >
                {expense.type === 'income' ? '+' : '-'}฿{expense.amount.toFixed(2)}
              </div>
              <div className="flex items-center gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => onEdit(expense)}
                  className="p-1 text-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-md transition-colors"
                  title="Edit"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => onDelete(expense.id)}
                  className="p-1 text-red-400 hover:text-red-600 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md transition-colors"
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ExpenseList;
