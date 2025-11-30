import React from 'react';
import { type Expense, ExpenseCategory, IncomeCategory } from '../types';
import { ShoppingBag, Coffee, Car, Home, Zap, Film, Heart, Briefcase, GraduationCap, Plane, HelpCircle, ShoppingCart, Trash2, Edit2, DollarSign, Gift, TrendingUp } from 'lucide-react';

interface ExpenseListProps {
  expenses: Expense[];
  onDelete: (id: string) => void;
  onEdit: (expense: Expense) => void;
}

const getCategoryIcon = (category: ExpenseCategory | IncomeCategory) => {
  switch (category) {
    case ExpenseCategory.FOOD: return <Coffee className="w-5 h-5 text-orange-500" />;
    case ExpenseCategory.GROCERIES: return <ShoppingCart className="w-5 h-5 text-green-500" />;
    case ExpenseCategory.TRANSPORT: return <Car className="w-5 h-5 text-blue-500" />;
    case ExpenseCategory.HOUSING: return <Home className="w-5 h-5 text-indigo-500" />;
    case ExpenseCategory.UTILITIES: return <Zap className="w-5 h-5 text-yellow-500" />;
    case ExpenseCategory.ENTERTAINMENT: return <Film className="w-5 h-5 text-pink-500" />;
    case ExpenseCategory.HEALTH: return <Heart className="w-5 h-5 text-red-500" />;
    case ExpenseCategory.BUSINESS: return <Briefcase className="w-5 h-5 text-slate-600" />;
    case ExpenseCategory.EDUCATION: return <GraduationCap className="w-5 h-5 text-purple-500" />;
    case ExpenseCategory.TRAVEL: return <Plane className="w-5 h-5 text-sky-500" />;
    case ExpenseCategory.SHOPPING: return <ShoppingBag className="w-5 h-5 text-teal-500" />;
    case ExpenseCategory.SHOPPING: return <ShoppingBag className="w-5 h-5 text-teal-500" />;

    // Income Categories
    case IncomeCategory.SALARY: return <DollarSign className="w-5 h-5 text-green-600" />;
    case IncomeCategory.FREELANCE: return <Briefcase className="w-5 h-5 text-blue-600" />;
    case IncomeCategory.INVESTMENT: return <TrendingUp className="w-5 h-5 text-purple-600" />;
    case IncomeCategory.GIFT: return <Gift className="w-5 h-5 text-pink-500" />;
    case IncomeCategory.OTHER: return <DollarSign className="w-5 h-5 text-slate-500" />;

    default: return <HelpCircle className="w-5 h-5 text-slate-400" />;
  }
};

const ExpenseList: React.FC<ExpenseListProps> = ({ expenses, onDelete, onEdit }) => {
  if (expenses.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-12 text-center transition-colors">
        <div className="w-16 h-16 bg-slate-50 dark:bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-4 transition-colors">
          <ShoppingBag className="w-8 h-8 text-slate-300 dark:text-slate-500" />
        </div>
        <h3 className="text-lg font-medium text-slate-900 dark:text-white">No expenses yet</h3>
        <p className="text-slate-500 dark:text-slate-400 mt-1">Add your first transaction to get started.</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 overflow-hidden shadow-sm transition-colors">
      <div className="divide-y divide-slate-50 dark:divide-slate-700">
        {expenses.map((expense) => (
          <div key={expense.id} className="p-4 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors flex items-center gap-4 group">
            <div className="w-10 h-10 rounded-full bg-slate-50 dark:bg-slate-700 flex items-center justify-center shrink-0 border border-slate-100 dark:border-slate-600 transition-colors">
              {getCategoryIcon(expense.category)}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <h4 className="font-semibold text-slate-800 dark:text-slate-200 truncate">{expense.description}</h4>
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hidden sm:inline-block">
                  {expense.category}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span>{new Date(expense.date).toLocaleDateString()}</span>
                {expense.tags.length > 0 && (
                  <>
                    <span>•</span>
                    <div className="flex gap-1 overflow-hidden">
                      {expense.tags.map(tag => (
                        <span key={tag} className="text-slate-400 italic">#{tag}</span>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="text-right flex flex-col items-end">
              <div className={`font-bold ${expense.type === 'income' ? 'text-green-600 dark:text-green-400' : 'text-slate-900 dark:text-white'}`}>
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
