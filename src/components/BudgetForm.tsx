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

const inputClass =
  'w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 outline-none transition-all focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 [color-scheme:dark]';

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
      if (!tags.includes(tagInput.trim())) setTags([...tags, tagInput.trim()]);
      setTagInput('');
    }
  };

  const removeTag = (tagToRemove: string) => setTags(tags.filter((tag) => tag !== tagToRemove));

  return (
    <div className="bg-[#0f172a] rounded-none md:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-full md:max-h-[90vh]">
      {/* Header */}
      <div className="px-6 py-4 border-b border-white/5 flex justify-between items-center bg-white/3 sticky top-0 z-10">
        <h2 className="text-xl font-bold gradient-text">
          {initialData ? 'Edit Budget' : 'Create Budget'}
        </h2>
      </div>

      <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto">
        {/* Name + Amount */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Budget Name</label>
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
              className={`${inputClass} ${errors.name ? 'border-rose-500' : ''}`}
            />
            {errors.name && (
              <p id="budget-name-error" role="alert" className="text-xs text-rose-400 mt-1">{errors.name}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Amount Limit</label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 font-medium">฿</span>
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
                className={`${inputClass} pl-8 ${errors.amount ? 'border-rose-500' : ''}`}
              />
            </div>
            {errors.amount && (
              <p id="budget-amount-error" role="alert" className="text-xs text-rose-400 mt-1">{errors.amount}</p>
            )}
          </div>
        </div>

        {/* Date Range */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="flex items-center gap-1.5 text-sm font-medium text-slate-300 mb-1.5">
              <Calendar className="w-4 h-4 text-slate-500" /> Start Date
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
              className={`${inputClass} ${errors.startDate ? 'border-rose-500' : ''}`}
            />
            {errors.startDate && (
              <p id="budget-start-error" role="alert" className="text-xs text-rose-400 mt-1">{errors.startDate}</p>
            )}
          </div>
          <div>
            <label className="flex items-center gap-1.5 text-sm font-medium text-slate-300 mb-1.5">
              <Calendar className="w-4 h-4 text-slate-500" /> End Date
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
              className={`${inputClass} ${errors.endDate ? 'border-rose-500' : ''}`}
            />
            {errors.endDate && (
              <p id="budget-end-error" role="alert" className="text-xs text-rose-400 mt-1">{errors.endDate}</p>
            )}
          </div>
        </div>

        {/* Account */}
        <div>
          <label className="flex items-center gap-1.5 text-sm font-medium text-slate-300 mb-1.5">
            <Wallet className="w-4 h-4 text-slate-500" /> Account
          </label>
          <select
            value={selectedAccount}
            onChange={(e) => setSelectedAccount(e.target.value)}
            className={`${inputClass}`}
            style={{ colorScheme: 'dark' }}
          >
            <option value="" className="bg-[#1e293b]">All Accounts</option>
            {accounts.map((acc) => (
              <option key={acc.id} value={acc.id} className="bg-[#1e293b]">{acc.name}</option>
            ))}
          </select>
          <p className="text-xs text-slate-600 mt-1">Leave empty to track across all accounts.</p>
        </div>

        {/* Categories */}
        <div>
          <label className="flex items-center gap-1.5 text-sm font-medium text-slate-300 mb-2">
            <Layers className="w-4 h-4 text-slate-500" /> Categories (Optional)
          </label>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => toggleCategory(cat)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
                  selectedCategories.includes(cat)
                    ? 'bg-violet-500/15 border-violet-500/40 text-violet-300'
                    : 'bg-white/3 border-white/10 text-slate-400 hover:bg-white/8 hover:text-slate-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Tags */}
        <div>
          <label className="flex items-center gap-1.5 text-sm font-medium text-slate-300 mb-1.5">
            <Tag className="w-4 h-4 text-slate-500" /> Tags (Optional)
          </label>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="bg-white/5 text-slate-300 border border-white/10 px-2.5 py-1 rounded-lg text-sm flex items-center gap-1.5"
                >
                  #{tag}
                  <button type="button" onClick={() => removeTag(tag)} className="hover:text-rose-400 transition-colors">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <input
            type="text"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={addTag}
            placeholder="Type tag and press Enter"
            className={inputClass}
          />
        </div>
      </form>

      {/* Footer */}
      <div className="p-5 border-t border-white/5 bg-[#0f172a] flex justify-end gap-3 sticky bottom-0">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2.5 text-slate-400 hover:bg-white/5 rounded-xl transition-colors font-medium"
        >
          Cancel
        </button>
        <button
          type="submit"
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="px-6 py-2.5 rounded-xl font-semibold text-white
            bg-gradient-to-r from-violet-600 to-indigo-500
            hover:from-violet-500 hover:to-indigo-400
            shadow-lg shadow-violet-600/20 transition-all
            disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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
