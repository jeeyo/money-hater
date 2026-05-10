import React, { useState } from 'react';
import { Plus, Edit2, Trash2, Wallet, CreditCard, Briefcase, Home, ShoppingBag } from 'lucide-react';
import { useAccount } from '../context/AccountContext';
import type { Account } from '../context/AccountContext';
import Layout from '../components/Layout';

const ICON_OPTIONS = [
  { id: 'wallet', icon: Wallet, label: 'Wallet' },
  { id: 'credit-card', icon: CreditCard, label: 'Card' },
  { id: 'briefcase', icon: Briefcase, label: 'Business' },
  { id: 'home', icon: Home, label: 'Home' },
  { id: 'shopping-bag', icon: ShoppingBag, label: 'Shopping' },
];

const Accounts: React.FC = () => {
  const { accounts, selectedAccount, createAccount, updateAccount, deleteAccount } = useAccount();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    type: 'normal',
    icon: 'wallet'
  });

  const handleOpenModal = (account?: Account) => {
    if (account) {
      setEditingAccount(account);
      setFormData({
        name: account.name,
        type: account.type,
        icon: account.icon || 'wallet'
      });
    } else {
      setEditingAccount(null);
      setFormData({
        name: '',
        type: 'normal',
        icon: 'wallet'
      });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingAccount) {
        await updateAccount(editingAccount.id, formData);
      } else {
        await createAccount(formData);
      }
      setIsModalOpen(false);
    } catch (error) {
      console.error('Failed to save account:', error);
      alert('Failed to save account');
    }
  };

  const handleDelete = async (id: string) => {
    // Prevent deleting the currently active account
    if (selectedAccount?.id === id) {
      alert('Cannot delete the currently active account. Please switch to another account first.');
      return;
    }

    if (window.confirm('Are you sure you want to delete this account? All associated expenses will be deleted.')) {
      try {
        await deleteAccount(id);
      } catch (error) {
        console.error('Failed to delete account:', error);
        alert('Failed to delete account');
      }
    }
  };

  const getIcon = (iconName?: string) => {
    const option = ICON_OPTIONS.find(opt => opt.id === iconName);
    return option ? option.icon : Wallet;
  };

  return (
    <Layout>
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Accounts</h1>
            <p className="text-slate-500 dark:text-slate-400 mt-1">Manage your financial accounts</p>
          </div>
          <button
            onClick={() => handleOpenModal()}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-sm text-white rounded-lg transition-colors"
          >
            <Plus className="w-5 h-5" />
            Add Account
          </button>
        </div>

        <div className="space-y-3">
          {accounts.map(account => {
            const Icon = getIcon(account.icon);
            return (
              <div key={account.id} className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-700 transition-all">
                <div className="flex items-center gap-4">
                  {/* Icon */}
                  <div className="p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg flex-shrink-0">
                    <Icon className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                  </div>

                  {/* Name */}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white truncate">{account.name}</h3>
                  </div>

                  {/* Type */}
                  <div className="flex-shrink-0">
                    <span className="px-3 py-1 text-sm text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 rounded-lg capitalize">
                      {account.type.replace('_', ' ')}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleOpenModal(account)}
                      className="p-2 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg transition-colors"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(account.id)}
                      disabled={selectedAccount?.id === account.id}
                      className={`p-2 rounded-lg transition-colors ${selectedAccount?.id === account.id
                        ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed'
                        : 'text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20'
                        }`}
                      title={selectedAccount?.id === account.id ? 'Cannot delete active account' : 'Delete account'}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-6 border-b border-slate-200 dark:border-slate-700">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
                {editingAccount ? 'Edit Account' : 'Add Account'}
              </h2>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label htmlFor="account-name" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Account Name
                </label>
                <input
                  id="account-name"
                  type="text"
                  required
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                  placeholder="e.g., Personal Checking"
                />
              </div>

              <div>
                <label htmlFor="account-type" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Type
                </label>
                <select
                  id="account-type"
                  value={formData.type}
                  onChange={e => setFormData({ ...formData, type: e.target.value })}
                  className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                >
                  <option value="normal">Normal</option>
                  <option value="credit_card">Credit Card</option>
                  <option value="savings">Savings</option>
                  <option value="business">Business</option>
                </select>
              </div>

              <fieldset>
                <legend className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
                  Icon
                </legend>
                <div className="flex gap-4">
                  {ICON_OPTIONS.map(option => {
                    const Icon = option.icon;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => setFormData({ ...formData, icon: option.id })}
                        className={`p-3 rounded-xl border transition-all ${formData.icon === option.id
                          ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400'
                          : 'border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-700 text-slate-500 dark:text-slate-400'
                          }`}
                        title={option.label}
                      >
                        <Icon className="w-5 h-5" />
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
                >
                  {editingAccount ? 'Save Changes' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default Accounts;
