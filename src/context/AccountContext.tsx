import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';

export interface Account {
  id: string;
  name: string;
  type: string;
  icon?: string;
  userId: string;
  createdAt: number;
}

interface AccountContextType {
  accounts: Account[];
  selectedAccount: Account | null;
  isLoading: boolean;
  fetchAccounts: () => Promise<void>;
  createAccount: (data: Partial<Account>) => Promise<Account>;
  updateAccount: (id: string, data: Partial<Account>) => Promise<Account>;
  deleteAccount: (id: string) => Promise<void>;
  selectAccount: (account: Account) => void;
}

const AccountContext = createContext<AccountContextType | undefined>(undefined);

export const AccountProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, token } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(() => {
    const saved = localStorage.getItem('selectedAccount');
    return saved ? JSON.parse(saved) : null;
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (user && token) {
      fetchAccounts();
    } else {
      setIsLoading(false);
      setAccounts([]);
      setSelectedAccount(null);
    }
  }, [user, token]);

  // Persist selected account
  useEffect(() => {
    if (selectedAccount) {
      localStorage.setItem('selectedAccount', JSON.stringify(selectedAccount));
    } else {
      localStorage.removeItem('selectedAccount');
    }
  }, [selectedAccount]);

  const fetchAccounts = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/accounts', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        setAccounts(data);

        // If no account selected or selected account not in list, select first one
        if (data.length > 0) {
          const currentSelected = data.find((a: Account) => a.id === selectedAccount?.id);
          if (!currentSelected) {
            setSelectedAccount(data[0]);
          } else {
            // Update selected account with latest data
            setSelectedAccount(currentSelected);
          }
        } else {
          // If no accounts, create a default one automatically
          await createDefaultAccount();
        }
      }
    } catch (error) {
      console.error('Failed to fetch accounts', error);
    } finally {
      setIsLoading(false);
    }
  };

  const createDefaultAccount = async () => {
    try {
      const newAccount = await createAccount({
        name: 'Default',
        type: 'normal',
        icon: 'wallet'
      });
      setSelectedAccount(newAccount);
    } catch (e) {
      console.error("Failed to create default account", e);
    }
  }

  const createAccount = async (data: Partial<Account>) => {
    const response = await fetch('/api/accounts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      throw new Error('Failed to create account');
    }

    const newAccount = await response.json();
    setAccounts(prev => [...prev, newAccount]);
    return newAccount;
  };

  const updateAccount = async (id: string, data: Partial<Account>) => {
    const response = await fetch(`/api/accounts/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      throw new Error('Failed to update account');
    }

    const updatedAccount = await response.json();
    setAccounts(prev => prev.map(a => a.id === id ? updatedAccount : a));

    if (selectedAccount?.id === id) {
      setSelectedAccount(updatedAccount);
    }

    return updatedAccount;
  };

  const deleteAccount = async (id: string) => {
    const response = await fetch(`/api/accounts/${id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to delete account');
    }

    setAccounts(prev => prev.filter(a => a.id !== id));

    if (selectedAccount?.id === id) {
      // Select another account if available
      const remaining = accounts.filter(a => a.id !== id);
      if (remaining.length > 0) {
        setSelectedAccount(remaining[0]);
      } else {
        setSelectedAccount(null);
      }
    }
  };

  const selectAccount = (account: Account) => {
    setSelectedAccount(account);
  };

  return (
    <AccountContext.Provider value={{
      accounts,
      selectedAccount,
      isLoading,
      fetchAccounts,
      createAccount,
      updateAccount,
      deleteAccount,
      selectAccount
    }}>
      {children}
    </AccountContext.Provider>
  );
};

export const useAccount = () => {
  const context = useContext(AccountContext);
  if (context === undefined) {
    throw new Error('useAccount must be used within an AccountProvider');
  }
  return context;
};
