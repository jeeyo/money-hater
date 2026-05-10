import React, { useState, useEffect, useMemo } from 'react';
import { Filter } from 'lucide-react';
import { useAccount } from '../context/AccountContext';
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

  // Filter states
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

  // Disable body scroll when dialog is open
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
    setTimeout(() => {
      setEditingExpense(null);
    }, 200);
  };

  const deleteExpense = (id: string) => {
    deleteExpenseMutation.mutate(id);
  };

  // Get all unique categories from expenses
  const allCategories = useMemo(() => {
    const categories = new Set<string>();

    expenses.forEach(exp => {
      categories.add(exp.category);
    });

    return Array.from(categories).sort();
  }, [expenses]);

  // Filter expenses based on selected filters
  const filteredExpenses = useMemo(() => {
    let filtered = [...expenses];

    // Date filter
    if (dateFilter !== 'all') {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      filtered = filtered.filter(exp => {
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

    // Category filter
    if (selectedCategories.length > 0) {
      filtered = filtered.filter(exp => selectedCategories.includes(exp.category));
    }

    // Tag filter
    if (selectedTags.length > 0) {
      filtered = filtered.filter(exp =>
        exp.tags?.some(tag => selectedTags.includes(tag))
      );
    }

    return filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [expenses, dateFilter, selectedCategories, selectedTags]);

  // Group transactions by date
  const groupedTransactions = useMemo(() => {
    const groups = new Map<string, Expense[]>();

    filteredExpenses.forEach(exp => {
      const dateKey = exp.date;
      if (!groups.has(dateKey)) {
        groups.set(dateKey, []);
      }
      groups.get(dateKey)!.push(exp);
    });

    return Array.from(groups.entries()).sort((a, b) =>
      new Date(b[0]).getTime() - new Date(a[0]).getTime()
    );
  }, [filteredExpenses]);

  const toggleCategory = (category: string) => {
    setSelectedCategories(prev =>
      prev.includes(category)
        ? prev.filter(c => c !== category)
        : [...prev, category]
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

  const removeTag = (tagToRemove: string) => {
    setSelectedTags(selectedTags.filter(t => t !== tagToRemove));
  };

  const clearFilters = () => {
    setDateFilter('all');
    setSelectedCategories([]);
    setSelectedTags([]);
  };

  const hasActiveFilters = dateFilter !== 'all' || selectedCategories.length > 0 || selectedTags.length > 0;

  return (
    <Layout>
      {isLoading ? (
        <div className="flex items-center justify-center min-h-[80vh]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
        </div>
      ) : (
        <div className="pb-16">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Transactions</h1>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${hasActiveFilters
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
                }`}
            >
              <Filter className="w-4 h-4" />
              <span>Filters</span>
              {hasActiveFilters && (
                <span className="bg-white/20 px-2 py-0.5 rounded-full text-xs">
                  {(dateFilter !== 'all' ? 1 : 0) + selectedCategories.length + selectedTags.length}
                </span>
              )}
            </button>
          </div>

          {/* Filters Panel */}
          {showFilters && (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 mb-6">
              <div className="space-y-4">
                {/* Date Filter */}
                <fieldset>
                  <legend className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Date Range
                  </legend>
                  <div className="flex flex-wrap gap-2">
                    {(['all', 'today', 'week', 'month'] as DateFilter[]).map(filter => (
                      <button
                        key={filter}
                        onClick={() => setDateFilter(filter)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${dateFilter === filter
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                          }`}
                      >
                        {filter === 'all' ? 'All Time' : filter === 'today' ? 'Today' : filter === 'week' ? 'This Week' : 'This Month'}
                      </button>
                    ))}
                  </div>
                </fieldset>

                {/* Category Filter */}
                {allCategories.length > 0 && (
                  <fieldset>
                    <legend className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Categories
                    </legend>
                    <div className="flex flex-wrap gap-2">
                      {allCategories.map(category => (
                        <button
                          key={category}
                          onClick={() => toggleCategory(category)}
                          className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${selectedCategories.includes(category)
                            ? 'bg-indigo-600 text-white'
                            : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                            }`}
                        >
                          {category}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                )}

                {/* Tag Filter */}
                <div>
                  <label htmlFor="tag-filter-input" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Tags
                  </label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {selectedTags.map((tag) => (
                      <span key={tag} className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-800 transition-colors">
                        {tag}
                        <button
                          type="button"
                          onClick={() => removeTag(tag)}
                          aria-label={`Remove tag ${tag}`}
                          className="ml-1 hover:text-indigo-900"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                  <input
                    id="tag-filter-input"
                    type="text"
                    onKeyDown={handleTagInput}
                    placeholder="Add tag & press Enter"
                    className="w-full px-4 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  />
                </div>

                {/* Clear Filters */}
                {hasActiveFilters && (
                  <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
                    <button
                      onClick={clearFilters}
                      className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300"
                    >
                      Clear all filters
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Transactions List */}
          <div className="space-y-4">
            {isLoading ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
              </div>
            ) : groupedTransactions.length === 0 ? (
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-8 text-center">
                <p className="text-slate-500 dark:text-slate-400">
                  {hasActiveFilters ? 'No transactions match your filters' : 'No transactions yet'}
                </p>
              </div>
            ) : (
              groupedTransactions.map(([date, transactions]) => (
                <div key={date} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                  {/* Date Header */}
                  <div className="px-4 py-2 bg-slate-50 dark:bg-slate-700/30 border-b border-slate-200 dark:border-slate-700">
                    <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      {new Date(date).toLocaleDateString('en-US', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}
                    </h3>
                  </div>

                  {/* Transactions */}
                  <div className="divide-y divide-slate-200 dark:divide-slate-700">
                    {transactions.map(transaction => (
                      <div
                        key={transaction.id}
                        onClick={() => handleEditClick(transaction)}
                        className="px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/30 cursor-pointer transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          {/* Category Icon */}
                          <div className="w-10 h-10 flex items-center justify-center flex-shrink-0">
                            {getCategoryIcon(transaction.category)}
                          </div>

                          {/* Description and Tags */}
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-slate-900 dark:text-white truncate">
                              {transaction.description}
                            </div>
                            {transaction.tags && transaction.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {transaction.tags.map(tag => (
                                  <span
                                    key={tag}
                                    className="text-xs px-2 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 rounded"
                                  >
                                    #{tag}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Amount */}
                          <div className={`text-sm font-semibold flex-shrink-0 ${transaction.type === 'income'
                            ? 'text-green-600 dark:text-green-400'
                            : 'text-red-600 dark:text-red-400'
                            }`}>
                            {transaction.type === 'income' ? '+' : '-'}฿{transaction.amount.toFixed(2)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Modal Overlay */}
          {isFormOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center md:p-4">
              <div
                className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm transition-opacity"
                onClick={handleCloseForm}
              />
              <div className="relative w-full max-w-lg h-full md:max-h-[90vh] md:rounded-xl bg-slate-800 shadow-lg overflow-y-auto">
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
                      // toast already raised by global error handler
                    }
                  }}
                  onCancel={handleCloseForm}
                  onDelete={editingExpense ? () => {
                    deleteExpense(editingExpense.id);
                    handleCloseForm();
                  } : undefined}
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
