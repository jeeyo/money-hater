import React from 'react';
import { type Expense, ExpenseCategory } from '../types';
import { ShoppingBag, Coffee, Car, Home, Zap, Film, Heart, Briefcase, GraduationCap, Plane, HelpCircle, ShoppingCart, Trash2, Edit2 } from 'lucide-react';

interface ExpenseListProps {
  expenses: Expense[];
  onDelete: (id: string) => void;
  onEdit: (expense: Expense) => void;
}

const getCategoryIcon = (category: ExpenseCategory) => {
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
    default: return <HelpCircle className="w-5 h-5 text-slate-400" />;
  }
};

const ExpenseList: React.FC<ExpenseListProps> = ({ expenses, onDelete, onEdit }) => {
  if (expenses.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center">
        <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
          <ShoppingBag className="w-8 h-8 text-slate-300" />
        </div>
        <h3 className="text-lg font-medium text-slate-900">No expenses yet</h3>
        <p className="text-slate-500 mt-1">Add your first transaction to get started.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
      <div className="p-6 border-b border-slate-50">
        <h3 className="text-lg font-bold text-slate-800">Recent Transactions</h3>
      </div>
      <div className="divide-y divide-slate-50">
        {expenses.map((expense) => (
          <div key={expense.id} className="p-4 hover:bg-slate-50 transition-colors flex items-center gap-4 group">
            <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center shrink-0 border border-slate-100">
              {getCategoryIcon(expense.category)}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <h4 className="font-semibold text-slate-800 truncate">{expense.description}</h4>
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 hidden sm:inline-block">
                  {expense.category}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500">
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
              <div className="font-bold text-slate-900">
                -฿{expense.amount.toFixed(2)}
              </div>
              <div className="flex items-center gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => onEdit(expense)}
                  className="p-1 text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
                  title="Edit"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => onDelete(expense.id)}
                  className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
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
