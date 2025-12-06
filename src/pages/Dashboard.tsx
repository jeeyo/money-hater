import React, { useState, useEffect, useMemo } from 'react';
import { Plus, TrendingUp, TrendingDown } from 'lucide-react';
import { LineChart, Line, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { useAccount } from '../context/AccountContext';
import ExpenseForm from '../components/ExpenseForm';
import { type Expense, ExpenseCategory, IncomeCategory, type TransactionType } from '../types';
import { getAllExpenses, addExpenseToDB, updateExpenseInDB, deleteExpenseFromDB } from '../services/api';
import Layout from '../components/Layout';
import { getCategoryIcon } from '../utils/categoryIcons';

const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316', '#eab308', '#84cc16', '#10b981'];

const Dashboard: React.FC = () => {
  const { selectedAccount } = useAccount();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const initData = async () => {
      try {
        const localData = localStorage.getItem('smartspend_expenses');
        if (localData) {
          const parsedData: Expense[] = JSON.parse(localData);
          if (parsedData.length > 0) {
            for (const expense of parsedData) {
              try {
                if (!expense.type) expense.type = 'expense';
                await addExpenseToDB(expense);
              } catch (e) {
                // Ignore duplicate key errors
              }
            }
            localStorage.removeItem('smartspend_expenses');
          }
        }

        if (selectedAccount) {
          const dbData = await getAllExpenses(selectedAccount.id);
          setExpenses(dbData);
        } else {
          setExpenses([]);
        }
      } catch (error) {
        console.error("Failed to load expenses:", error);
      } finally {
        setIsLoading(false);
      }
    };

    initData();
  }, [selectedAccount]);

  const handleSaveExpense = async (data: { description: string; amount: number; date: string; category: ExpenseCategory | IncomeCategory; type: TransactionType; tags: string[] }) => {
    if (editingExpense) {
      const updatedExpense = { ...editingExpense, ...data };
      setExpenses(prev => prev.map(e => e.id === editingExpense.id ? updatedExpense : e));
      handleCloseForm();

      try {
        await updateExpenseInDB(updatedExpense);
        if (selectedAccount) {
          const reloaded = await getAllExpenses(selectedAccount.id);
          setExpenses(reloaded);
        }
      } catch (error) {
        console.error("Failed to update expense", error);
      }
    } else {
      const newExpense: Expense = {
        id: crypto.randomUUID(),
        createdAt: Date.now(),
        accountId: selectedAccount?.id,
        ...data
      };

      setExpenses(prev => [newExpense, ...prev]);
      handleCloseForm();

      try {
        await addExpenseToDB(newExpense);
        if (selectedAccount) {
          const reloaded = await getAllExpenses(selectedAccount.id);
          setExpenses(reloaded);
        }
      } catch (error) {
        console.error("Failed to add expense", error);
      }
    }
  };

  const deleteExpense = async (id: string) => {
    const previousExpenses = [...expenses];
    setExpenses(prev => prev.filter(e => e.id !== id));

    try {
      await deleteExpenseFromDB(id);
    } catch (error) {
      console.error("Failed to delete expense", error);
      setExpenses(previousExpenses);
    }
  };

  const handleEditClick = (expense: Expense) => {
    setEditingExpense(expense);
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setTimeout(() => setEditingExpense(null), 200);
  };

  // Calculate stats
  const { totalIncome, totalExpense, netBalance } = useMemo(() => {
    return expenses.reduce((acc, item) => {
      if (item.type === 'income') {
        acc.totalIncome += item.amount;
        acc.netBalance += item.amount;
      } else {
        acc.totalExpense += item.amount;
        acc.netBalance -= item.amount;
      }
      return acc;
    }, { totalIncome: 0, totalExpense: 0, netBalance: 0 });
  }, [expenses]);

  // Get current month stats
  const currentMonthStats = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    return expenses
      .filter(e => {
        if (!e.date) return false;
        const [year, month] = e.date.split('-').map(Number);
        return year === currentYear && month === currentMonth;
      })
      .reduce((acc, e) => {
        if (e.type === 'income') {
          acc.income += e.amount;
        } else {
          acc.expense += e.amount;
        }
        return acc;
      }, { income: 0, expense: 0 });
  }, [expenses]);

  // Category data for pie chart
  const categoryData = useMemo(() => {
    const map = new Map<string, number>();
    expenses
      .filter(e => e.type !== 'income')
      .forEach(exp => {
        map.set(exp.category, (map.get(exp.category) || 0) + exp.amount);
      });

    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 4);
  }, [expenses]);

  // Chart data for line chart (last 5 months)
  const chartData = useMemo(() => {
    const dataMap = new Map<string, { income: number; expense: number }>();
    const now = new Date();
    const monthsData: { label: string; key: string }[] = [];

    // Generate keys and labels for the last 5 months (e.g., '2023-01', 'Jan')
    for (let i = 4; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      const monthKey = `${year}-${month.toString().padStart(2, '0')}`;
      const monthLabel = date.toLocaleString('en-US', { month: 'short' });
      monthsData.push({ label: monthLabel, key: monthKey });
      dataMap.set(monthKey, { income: 0, expense: 0 }); // Initialize with zero values
    }

    // Aggregate expenses into the map
    expenses.forEach(exp => {
      if (!exp.date) return;
      const expenseDate = new Date(exp.date);
      const year = expenseDate.getFullYear();
      const month = expenseDate.getMonth() + 1;
      const monthKey = `${year}-${month.toString().padStart(2, '0')}`;

      if (dataMap.has(monthKey)) {
        const current = dataMap.get(monthKey)!;
        if (exp.type === 'income') {
          current.income += exp.amount;
        } else {
          current.expense += exp.amount;
        }
        dataMap.set(monthKey, current);
      }
    });

    // Convert map data to the desired array format, ensuring correct month order
    return monthsData.map(m => ({
      month: m.label,
      income: dataMap.get(m.key)?.income || 0,
      expense: dataMap.get(m.key)?.expense || 0,
    }));
  }, [expenses]);

  // Recent transactions (last 8)
  const recentTransactions = useMemo(() => {
    return [...expenses]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 8);
  }, [expenses]);

  return (
    <Layout>
      {/* Top Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2 mb-6">
        {/* Net Balance Card with Chart */}
        <div className="md:col-span-2 lg:col-span-1 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
          <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-sm mb-2">
            <div className="w-4 h-4 bg-slate-200 dark:bg-slate-700 rounded"></div>
            <span>Net Balance</span>
          </div>
          <div className="text-3xl font-bold mb-1 text-slate-900 dark:text-white">฿{netBalance.toFixed(2)}</div>
          <div className="flex items-center gap-3 text-xs mb-3">
            <span className="text-green-600 dark:text-green-400">+฿{totalIncome.toFixed(0)}</span>
            <span className="text-red-600 dark:text-red-400">-฿{totalExpense.toFixed(0)}</span>
          </div>
          <div className="h-24 -mx-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <Line type="monotone" dataKey="income" stroke="#10b981" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="expense" stroke="#f43f5e" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Monthly Budget Card */}
        {/* <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-slate-400">Monthly Budget</span>
            <select className="text-xs bg-slate-700 border border-slate-600 rounded px-2 py-1">
              <option>All Time</option>
              <option>This Month</option>
            </select>
          </div>
          <div className="text-2xl font-bold mb-1">฿5,000 <span className="text-sm text-slate-400">/ ฿10,000</span></div>
          <div className="w-full bg-slate-700 rounded-full h-2 mb-3">
            <div className="bg-indigo-500 h-2 rounded-full" style={{ width: '50%' }}></div>
          </div>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-400">Income</span>
              <span>฿5,000 / ฿10,000</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Transport</span>
              <span>฿5,000 / ฿10,000</span>
            </div>
          </div>
        </div> */}

        {/* Spending by Category */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-slate-600 dark:text-slate-400">Spending by Category</span>
            <select className="text-xs bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded px-2 py-1 text-slate-900 dark:text-white">
              <option>All Time</option>
            </select>
          </div>
          <div className="flex items-center justify-center mb-3">
            <div className="w-32 h-32">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryData.length > 0 ? categoryData : [{ name: 'No data', value: 1 }]}
                    cx="50%"
                    cy="50%"
                    innerRadius={35}
                    outerRadius={55}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {(categoryData.length > 0 ? categoryData : [{ name: 'No data', value: 1 }]).map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="space-y-1 text-xs">
            {categoryData.slice(0, 3).map((cat, idx) => (
              <div key={cat.name} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[idx] }}></div>
                  <span className="text-slate-600 dark:text-slate-400">{cat.name}:</span>
                </div>
                <span className="text-slate-900 dark:text-white">฿{cat.value.toFixed(0)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* This Month Card */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-4 h-4 bg-slate-200 dark:bg-slate-700 rounded"></div>
            <span className="text-sm text-slate-600 dark:text-slate-400">This Month</span>
          </div>
          <div className="space-y-3">
            <div>
              <div className="text-slate-600 dark:text-slate-400 text-xs mb-1">Income</div>
              <div className="text-green-600 dark:text-green-400 text-xl font-semibold flex items-center gap-1">
                <TrendingUp className="w-4 h-4" />
                +฿{currentMonthStats.income.toFixed(0)}
              </div>
            </div>
            <div>
              <div className="text-slate-600 dark:text-slate-400 text-xs mb-1">Expense</div>
              <div className="text-red-600 dark:text-red-400 text-xl font-semibold flex items-center gap-1">
                <TrendingDown className="w-4 h-4" />
                -฿{currentMonthStats.expense.toFixed(0)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Transactions Table */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2">
          <div className="w-4 h-4 bg-slate-200 dark:bg-slate-700 rounded"></div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Recent Transactions</h2>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          </div>
        ) : recentTransactions.length === 0 ? (
          <div className="p-8 text-center text-slate-500 dark:text-slate-400">
            <p>No transactions yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 dark:bg-slate-700/30">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 dark:text-slate-400">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 dark:text-slate-400">Category</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 dark:text-slate-400">Description</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-600 dark:text-slate-400">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {recentTransactions.map((transaction) => (
                  <tr
                    key={transaction.id}
                    className="hover:bg-slate-50 dark:hover:bg-slate-700/30 cursor-pointer transition-colors"
                    onClick={() => handleEditClick(transaction)}
                  >
                    <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300">
                      {new Date(transaction.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700/50 flex items-center justify-center">
                          {getCategoryIcon(transaction.category)}
                        </div>
                        <span className="text-sm text-slate-700 dark:text-slate-300">{transaction.category}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300">{transaction.description}</td>
                    <td className={`px-4 py-3 text-sm font-semibold text-right ${transaction.type === 'income' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                      }`}>
                      {transaction.type === 'income' ? '+' : '-'}฿{transaction.amount.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>


      {/* Floating Action Button */}
      <button
        onClick={() => {
          setEditingExpense(null);
          setIsFormOpen(true);
        }}
        className="fixed bottom-6 right-6 bg-indigo-600 hover:bg-indigo-700 text-white p-4 rounded-full shadow-lg transition-all hover:scale-105 z-40 flex items-center gap-2 group"
      >
        <Plus className="w-6 h-6 group-hover:rotate-90 transition-transform" />
      </button>

      {/* Modal Overlay */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm transition-opacity"
            onClick={handleCloseForm}
          />
          <div className="relative w-full max-w-lg bg-slate-800 rounded-xl shadow-lg max-h-[90vh] overflow-y-auto">
            <ExpenseForm
              onSubmit={handleSaveExpense}
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
    </Layout>
  );
};

export default Dashboard;
