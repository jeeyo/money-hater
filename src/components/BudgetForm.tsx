import React, { useState } from 'react';
import { X, Calendar, Tag, Wallet, Layers } from 'lucide-react';
import type { Budget, BudgetWithStats } from '../types';
import { ExpenseCategory } from '../types';
import { useAccount } from '../context/useAccount';
import {
  budgetFormSchema,
  flattenErrors,
  type BudgetFormValues,
  type FieldErrors,
} from '../lib/formValidation';

interface BudgetFormProps {
  initialData?: BudgetWithStats | null;
  onSubmit: (data: Omit<Budget, 'id' | 'createdAt' | 'userId'>) => Promise<void>;
  onCancel: () => void;
}

const CATEGORIES = Object.values(ExpenseCategory);

const BudgetForm: React.FC<BudgetFormProps> = ({ initialData, onSubmit, onCancel }) => {
  const { accounts } = useAccount();
  const [name, setName] = useState(initialData?.name || '');
  const [amount, setAmount] = useState(initialData?.amount?.toString() || '');
  const [startDate, setStartDate] = useState(
    initialData?.startDate
      ? new Date(initialData.startDate).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0],
  );
  const [endDate, setEndDate] = useState(
    initialData?.endDate
      ? new Date(initialData.endDate).toISOString().split('T')[0]
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  );
  const [selectedCategories, setSelectedCategories] = useState<string[]>(
    initialData?.categories || [],
  );
  const [selectedAccount, setSelectedAccount] = useState<string>(initialData?.accountId || '');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>(initialData?.tags || []);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<FieldErrors<BudgetFormValues>>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const candidate = {
      name,
      amount: parseFloat(amount),
      startDate,
      endDate,
      categories: selectedCategories,
      tags,
      accountId: selectedAccount || undefined,
    };

    const result = budgetFormSchema.safeParse(candidate);
    if (!result.success) {
      setErrors(flattenErrors<BudgetFormValues>(result.error));
      return;
    }

    setErrors({});
    setIsSubmitting(true);
    try {
      await onSubmit({
        name: result.data.name,
        amount: result.data.amount,
        startDate: new Date(result.data.startDate).toISOString(),
        endDate: new Date(result.data.endDate).toISOString(),
        categories: result.data.categories,
        tags: result.data.tags,
        accountId: result.data.accountId || undefined,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleCategory = (cat: string) => {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
    );
  };

  const addTag = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && tagInput.trim()) {
      e.preventDefault();
      if (!tags.includes(tagInput.trim())) {
        setTags([...tags, tagInput.trim()]);
      }
      setTagInput('');
    }
  };

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter((tag) => tag !== tagToRemove));
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl overflow-hidden flex flex-col max-h-full md:max-h-[90vh]">
      <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50 sticky top-0 z-10">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">
          {initialData ? 'Edit Budget' : 'Create Budget'}
        </h2>
      </div>

      <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto custom-scrollbar">
        {/* Name and Amount */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Budget Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }));
              }}
              placeholder="e.g., Monthly Groceries"
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? 'budget-name-error' : undefined}
              className={`w-full bg-white dark:bg-slate-700 border rounded-lg px-4 py-2 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all ${
                errors.name ? 'border-rose-500' : 'border-slate-300 dark:border-slate-600'
              }`}
            />
            {errors.name && (
              <p id="budget-name-error" role="alert" className="text-xs text-rose-500 mt-1">
                {errors.name}
              </p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Amount Limit
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">฿</span>
              <input
                type="number"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  if (errors.amount) setErrors((prev) => ({ ...prev, amount: undefined }));
                }}
                placeholder="0.00"
                step="0.01"
                aria-invalid={!!errors.amount}
                aria-describedby={errors.amount ? 'budget-amount-error' : undefined}
                className={`w-full bg-white dark:bg-slate-700 border rounded-lg pl-8 pr-4 py-2 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all ${
                  errors.amount ? 'border-rose-500' : 'border-slate-300 dark:border-slate-600'
                }`}
              />
            </div>
            {errors.amount && (
              <p id="budget-amount-error" role="alert" className="text-xs text-rose-500 mt-1">
                {errors.amount}
              </p>
            )}
          </div>
        </div>

        {/* Date Range */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
              <Calendar className="w-4 h-4 text-slate-400" /> Start Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                if (errors.startDate) setErrors((prev) => ({ ...prev, startDate: undefined }));
              }}
              aria-invalid={!!errors.startDate}
              aria-describedby={errors.startDate ? 'budget-start-error' : undefined}
              className={`w-full bg-white dark:bg-slate-700 border rounded-lg px-4 py-2 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none ${
                errors.startDate ? 'border-rose-500' : 'border-slate-300 dark:border-slate-600'
              }`}
            />
            {errors.startDate && (
              <p id="budget-start-error" role="alert" className="text-xs text-rose-500 mt-1">
                {errors.startDate}
              </p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
              <Calendar className="w-4 h-4 text-slate-400" /> End Date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                if (errors.endDate) setErrors((prev) => ({ ...prev, endDate: undefined }));
              }}
              min={startDate}
              aria-invalid={!!errors.endDate}
              aria-describedby={errors.endDate ? 'budget-end-error' : undefined}
              className={`w-full bg-white dark:bg-slate-700 border rounded-lg px-4 py-2 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none ${
                errors.endDate ? 'border-rose-500' : 'border-slate-300 dark:border-slate-600'
              }`}
            />
            {errors.endDate && (
              <p id="budget-end-error" role="alert" className="text-xs text-rose-500 mt-1">
                {errors.endDate}
              </p>
            )}
          </div>
        </div>

        {/* Account Selection */}
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
            <Wallet className="w-4 h-4 text-slate-400" /> Account
          </label>
          <select
            value={selectedAccount}
            onChange={(e) => setSelectedAccount(e.target.value)}
            className="w-full bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-4 py-2 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none appearance-none"
          >
            <option value="">All Accounts</option>
            {accounts.map((acc) => (
              <option key={acc.id} value={acc.id}>
                {acc.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-slate-500 mt-1">
            Select an account to track or leave empty for all accounts.
          </p>
        </div>

        {/* Categories */}
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-1">
            <Layers className="w-4 h-4 text-slate-400" /> Categories (Optional)
          </label>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => toggleCategory(cat)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
                  selectedCategories.includes(cat)
                    ? 'bg-indigo-100 border-indigo-200 text-indigo-700 dark:bg-indigo-900/50 dark:border-indigo-700 dark:text-indigo-300'
                    : 'bg-slate-50 border-slate-200 text-slate-600 dark:bg-slate-700/50 dark:border-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Tags */}
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
            <Tag className="w-4 h-4 text-slate-400" /> Tags (Optional)
          </label>
          <div className="flex flex-wrap gap-2 mb-2">
            {tags.map((tag) => (
              <span
                key={tag}
                className="bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 px-2 py-1 rounded-md text-sm flex items-center gap-1"
              >
                #{tag}
                <button type="button" onClick={() => removeTag(tag)} className="hover:text-red-500">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
          <input
            type="text"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={addTag}
            placeholder="Type tag and press Enter"
            className="w-full bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-4 py-2 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
          />
        </div>
      </form>

      <div className="p-6 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex justify-end gap-3 sticky bottom-0">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors font-medium"
        >
          Cancel
        </button>
        <button
          type="submit"
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow-md shadow-indigo-600/20 transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {isSubmitting ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Saving...
            </>
          ) : (
            'Save Budget'
          )}
        </button>
      </div>
    </div>
  );
};

export default BudgetForm;
