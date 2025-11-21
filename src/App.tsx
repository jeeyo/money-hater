import React, { useState, useEffect } from 'react';
import { LayoutDashboard, History, Plus } from 'lucide-react';
import ExpenseForm from './components/ExpenseForm';
import ExpenseList from './components/ExpenseList';
import ExpenseStats from './components/ExpenseStats';
import { type Expense, ExpenseCategory } from './types';
import { getAllExpenses, addExpenseToDB, updateExpenseInDB, deleteExpenseFromDB } from './services/db';

const App: React.FC = () => {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const initData = async () => {
      try {
        // Migration logic: Check if data exists in localStorage
        const localData = localStorage.getItem('smartspend_expenses');
        if (localData) {
          const parsedData: Expense[] = JSON.parse(localData);
          if (parsedData.length > 0) {
            console.log("Migrating data from localStorage to IndexedDB...");
            for (const expense of parsedData) {
              // Ensure we don't duplicate if running multiple times, 
              // though put handles updates, add might throw if key exists. 
              // Using put (updateExpenseInDB logic uses put) is safer for ID collisions or just use add and catch.
              // Since db logic is separate, let's just use add and catch error or assume clean slate.
              try {
                await addExpenseToDB(expense);
              } catch (e) {
                // Ignore duplicate key errors during migration
              }
            }
            localStorage.removeItem('smartspend_expenses');
          }
        }

        // Load from DB
        const dbData = await getAllExpenses();
        setExpenses(dbData);
      } catch (error) {
        console.error("Failed to load expenses:", error);
      } finally {
        setIsLoading(false);
      }
    };

    initData();
  }, []);

  const handleSaveExpense = async (data: { description: string; amount: number; date: string; category: ExpenseCategory; tags: string[] }) => {
    if (editingExpense) {
      // Update existing expense
      const updatedExpense = { ...editingExpense, ...data };

      // Optimistic UI update
      setExpenses(prev => prev.map(e => e.id === editingExpense.id ? updatedExpense : e));
      handleCloseForm();

      // DB Update
      try {
        await updateExpenseInDB(updatedExpense);
        // Optional: re-fetch to ensure sort order is correct if date changed, 
        // or just manual sort in state. For now, just optimistic is fine.
        const reloaded = await getAllExpenses();
        setExpenses(reloaded);
      } catch (error) {
        console.error("Failed to update expense", error);
        // Revert on error would go here
      }
    } else {
      // Add new expense
      const newExpense: Expense = {
        id: crypto.randomUUID(),
        createdAt: Date.now(),
        ...data
      };

      // Optimistic UI update
      setExpenses(prev => [newExpense, ...prev]);
      handleCloseForm();

      // DB Insert
      try {
        await addExpenseToDB(newExpense);
        const reloaded = await getAllExpenses();
        setExpenses(reloaded);
      } catch (error) {
        console.error("Failed to add expense", error);
      }
    }
  };

  const deleteExpense = async (id: string) => {
    // Optimistic UI update
    const previousExpenses = [...expenses];
    setExpenses(prev => prev.filter(e => e.id !== id));

    try {
      await deleteExpenseFromDB(id);
    } catch (error) {
      console.error("Failed to delete expense", error);
      setExpenses(previousExpenses); // Revert
    }
  };

  const handleEditClick = (expense: Expense) => {
    setEditingExpense(expense);
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setTimeout(() => setEditingExpense(null), 200); // Clear data after animation starts
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-24 relative">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-indigo-600 p-1.5 rounded-lg">
              <LayoutDashboard className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-purple-600">
              SmartSpend AI
            </h1>
          </div>
          <div className="text-sm text-slate-500 font-medium">
            {expenses.length} Transactions
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

        {/* Dashboard Stats */}
        <ExpenseStats expenses={expenses} />

        {/* Recent Expenses List - Full Width */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <History className="w-5 h-5 text-slate-400" />
              Transaction History
            </h2>
          </div>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            </div>
          ) : (
            <ExpenseList
              expenses={expenses}
              onDelete={deleteExpense}
              onEdit={handleEditClick}
            />
          )}
        </div>
      </main>

      {/* Floating Action Button */}
      <button
        onClick={() => {
          setEditingExpense(null);
          setIsFormOpen(true);
        }}
        className="fixed bottom-8 right-8 bg-indigo-600 hover:bg-indigo-700 text-white p-4 rounded-full shadow-xl shadow-indigo-300 transition-all hover:scale-105 z-40 flex items-center gap-3 group"
        aria-label="Add New Expense"
      >
        <Plus className="w-6 h-6 group-hover:rotate-90 transition-transform" />
      </button>

      {/* Modal Overlay */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity"
            onClick={handleCloseForm}
          />
          <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <ExpenseForm
              onSubmit={handleSaveExpense}
              onCancel={handleCloseForm}
              initialData={editingExpense}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
