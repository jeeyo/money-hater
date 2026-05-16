import React, { useState, useEffect, useMemo } from 'react';
import { Filter, ArrowLeftRight, X } from 'lucide-react';
import { useAccount } from '../context/useAccount';
import ExpenseForm from '../components/ExpenseForm';
import { type Expense } from '../types';
import {
  useExpenses,
  useDeleteExpense,
  useAddExpense,
  useUpdateExpense,
} from '../hooks/useExpenses';
import Layout from '../components/Layout';
import { getCategoryIcon } from '../utils/categoryIcons';

type DateFilter = 'today' | 'week' | 'month' | 'all';

const Transactions: React.FC = () => {
  const { selectedAccount, isLoading: isAccountLoading } = useAccount();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);

  const expensesQuery = useExpenses(
    selectedAccount ? { accountId: selectedAccount.id } : undefined,
    { enabled: !!selectedAccount },
  );
  const expenses = expensesQuery.data ?? [];
  const isLoading = isAccountLoading || (!!selectedAccount && expensesQuery.isLoading);

  const deleteExpenseMutation = useDeleteExpense();
  const addExpenseMutation = useAddExpense();
  const updateExpenseMutation = useUpdateExpense();

  useEffect(() => {
    if (isFormOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isFormOpen]);

  const handleEditClick = (expense: Expense) => {
    setEditingExpense(expense);
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setTimeout(() => setEditingExpense(null), 200);
  };

  const deleteExpense = (id: string) => deleteExpenseMutation.mutate(id);

  const allCategories = useMemo(() => {
    const categories = new Set<string>();
    expenses.forEach((exp) => categories.add(exp.category));
    return Array.from(categories).sort();
  }, [expenses]);

  const filteredExpenses = useMemo(() => {
    let filtered = [...expenses];
    if (dateFilter !== 'all') {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      filtered = filtered.filter((exp) => {
        const expDate = new Date(exp.date);
        switch (dateFilter) {
          case 'today':
            return expDate >= today;
          case 'week': {
            const weekAgo = new Date(today);
            weekAgo.setDate(weekAgo.getDate() - 7);
            return expDate >= weekAgo;
          }
          case 'month': {
            const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            return expDate >= monthStart;
          }
          default:
            return true;
        }
      });
    }
    if (selectedCategories.length > 0) {
      filtered = filtered.filter((exp) => selectedCategories.includes(exp.category));
    }
    if (selectedTags.length > 0) {
      filtered = filtered.filter((exp) => exp.tags?.some((tag) => selectedTags.includes(tag)));
    }
    return filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [expenses, dateFilter, selectedCategories, selectedTags]);

  const groupedTransactions = useMemo(() => {
    const groups = new Map<string, Expense[]>();
    filteredExpenses.forEach((exp) => {
      const dateKey = exp.date;
      if (!groups.has(dateKey)) groups.set(dateKey, []);
      groups.get(dateKey)!.push(exp);
    });
    return Array.from(groups.entries()).sort(
      (a, b) => new Date(b[0]).getTime() - new Date(a[0]).getTime(),
    );
  }, [filteredExpenses]);

  const toggleCategory = (category: string) => {
    setSelectedCategories((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category],
    );
  };

  const handleTagInput = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const val = e.currentTarget.value.trim();
      if (val && !selectedTags.includes(val)) {
        setSelectedTags([...selectedTags, val]);
        e.currentTarget.value = '';
      }
    }
  };

  const removeTag = (tagToRemove: string) =>
    setSelectedTags(selectedTags.filter((t) => t !== tagToRemove));

  const clearFilters = () => {
    setDateFilter('all');
    setSelectedCategories([]);
    setSelectedTags([]);
  };

  const hasActiveFilters =
    dateFilter !== 'all' || selectedCategories.length > 0 || selectedTags.length > 0;
  const activeFilterCount =
    (dateFilter !== 'all' ? 1 : 0) + selectedCategories.length + selectedTags.length;

  const dateLabels: Record<DateFilter, string> = {
    all: 'All Time',
    today: 'Today',
    week: 'This Week',
    month: 'This Month',
  };

  return (
    <Layout>
      {isLoading ? (
        <div className="flex items-center justify-center min-h-[80vh]">
          <div className="h-10 w-10 rounded-full border-2 border-violet-500/20 border-t-violet-500 animate-spin" />
        </div>
      ) : (
        <div className="pb-16 animate-fade-in-up">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold text-white">Transactions</h1>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl border transition-all text-sm font-medium ${
                hasActiveFilters
                  ? 'bg-violet-600 text-white border-violet-500 shadow-lg shadow-violet-600/20'
                  : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10'
              }`}
            >
              <Filter className="w-4 h-4" />
              Filters
              {hasActiveFilters && (
                <span className="bg-white/20 px-2 py-0.5 rounded-full text-xs">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>

          {/* Filters Panel */}
          {showFilters && (
            <div className="bg-[#1e293b] rounded-2xl border border-white/5 p-5 mb-6 animate-slide-down space-y-5">
              {/* Date Range */}
              <fieldset>
                <legend className="text-sm font-medium text-slate-300 mb-3">Date Range</legend>
                <div className="flex flex-wrap gap-2">
                  {(['all', 'today', 'week', 'month'] as DateFilter[]).map((filter) => (
                    <button
                      key={filter}
                      onClick={() => setDateFilter(filter)}
                      className={`px-4 py-2 rounded-full text-sm font-medium transition-all border ${
                        dateFilter === filter
                          ? 'bg-violet-500/15 text-violet-300 border-violet-500/30'
                          : 'bg-white/5 text-slate-400 border-white/8 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      {dateLabels[filter]}
                    </button>
                  ))}
                </div>
              </fieldset>

              {/* Categories */}
              {allCategories.length > 0 && (
                <fieldset>
                  <legend className="text-sm font-medium text-slate-300 mb-3">Categories</legend>
                  <div className="flex flex-wrap gap-2">
                    {allCategories.map((category) => (
                      <button
                        key={category}
                        onClick={() => toggleCategory(category)}
                        className={`px-3 py-1.5 rounded-full text-sm transition-all border ${
                          selectedCategories.includes(category)
                            ? 'bg-violet-500/15 text-violet-300 border-violet-500/30'
                            : 'bg-white/5 text-slate-400 border-white/8 hover:bg-white/10 hover:text-white'
                        }`}
                      >
                        {category}
                      </button>
                    ))}
                  </div>
                </fieldset>
              )}

              {/* Tags */}
              <div>
                <label
                  htmlFor="tag-filter-input"
                  className="block text-sm font-medium text-slate-300 mb-3"
                >
                  Tags
                </label>
                {selectedTags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {selectedTags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium
                          bg-violet-500/10 text-violet-300 border border-violet-500/20"
                      >
                        {tag}
                        <button
                          type="button"
                          onClick={() => removeTag(tag)}
                          aria-label={`Remove tag ${tag}`}
                          className="ml-1.5 hover:text-white transition-colors"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <input
                  id="tag-filter-input"
                  type="text"
                  onKeyDown={handleTagInput}
                  placeholder="Add tag & press Enter"
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white
                    placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500/40
                    focus:border-violet-500 text-sm transition-all"
                />
              </div>

              {hasActiveFilters && (
                <div className="pt-3 border-t border-white/5">
                  <button
                    onClick={clearFilters}
                    className="text-sm text-violet-400 hover:text-violet-300 transition-colors"
                  >
                    Clear all filters
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Transaction Groups */}
          <div className="space-y-3">
            {groupedTransactions.length === 0 ? (
              <div className="bg-[#1e293b] rounded-2xl border border-white/5 p-12 text-center">
                <ArrowLeftRight className="w-8 h-8 mx-auto mb-3 text-slate-600 opacity-30" />
                <p className="text-slate-500">
                  {hasActiveFilters ? 'No transactions match your filters' : 'No transactions yet'}
                </p>
              </div>
            ) : (
              groupedTransactions.map(([date, transactions], groupIdx) => (
                <div
                  key={date}
                  className="bg-[#1e293b] rounded-2xl border border-white/5 overflow-hidden animate-fade-in-up"
                  style={{ animationDelay: `${groupIdx * 50}ms` }}
                >
                  {/* Date header */}
                  <div className="px-4 py-3 bg-white/[0.03] border-b border-white/5 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-300">
                      {new Date(date).toLocaleDateString('en-US', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </h3>
                    <span className="text-xs text-slate-600 tabular-nums">
                      {transactions.length} item{transactions.length !== 1 ? 's' : ''}
                    </span>
                  </div>

                  {/* Transactions */}
                  {transactions.map((transaction, tIdx) => (
                    <div
                      key={transaction.id}
                      onClick={() => handleEditClick(transaction)}
                      className={`px-4 py-3.5 flex items-center gap-3 hover:bg-white/[0.03] cursor-pointer transition-colors
                        ${tIdx < transactions.length - 1 ? 'border-b border-white/5' : ''}`}
                    >
                      {/* Category icon */}
                      <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center flex-shrink-0">
                        {getCategoryIcon(transaction.category)}
                      </div>

                      {/* Description + tags */}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-white truncate">
                          {transaction.description}
                        </div>
                        {transaction.tags && transaction.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {transaction.tags.map((tag) => (
                              <span
                                key={tag}
                                className="text-[11px] px-2 py-0.5 bg-white/5 text-slate-500 rounded-md"
                              >
                                #{tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Amount */}
                      <div
                        className={`text-sm font-semibold flex-shrink-0 tabular-nums
                        ${transaction.type === 'income' ? 'text-emerald-400' : 'text-rose-400'}`}
                      >
                        {transaction.type === 'income' ? '+' : '-'}฿{transaction.amount.toFixed(2)}
                      </div>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>

          {/* Modal */}
          {isFormOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center md:p-4">
              <div
                className="absolute inset-0 bg-[#0f172a]/80 backdrop-blur-md"
                onClick={handleCloseForm}
              />
              <div
                className="relative w-full max-w-lg h-full md:max-h-[90vh] md:rounded-2xl
                bg-[#0f172a] shadow-2xl overflow-y-auto animate-scale-in"
              >
                <ExpenseForm
                  onSubmit={async (data) => {
                    handleCloseForm();
                    try {
                      if (editingExpense) {
                        await updateExpenseMutation.mutateAsync({ ...editingExpense, ...data });
                      } else {
                        await addExpenseMutation.mutateAsync({
                          id: crypto.randomUUID(),
                          createdAt: Date.now(),
                          accountId: selectedAccount?.id,
                          ...data,
                        });
                      }
                    } catch {
                      /* toast raised by global handler */
                    }
                  }}
                  onCancel={handleCloseForm}
                  onDelete={
                    editingExpense
                      ? () => {
                          deleteExpense(editingExpense.id);
                          handleCloseForm();
                        }
                      : undefined
                  }
                  initialData={editingExpense}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </Layout>
  );
};

export default Transactions;
