import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from './useAuth';
import { AccountContext, type Account } from './accountContextValue';
import { apiJson } from '../services/api';

const readStoredAccount = (): Account | null => {
  const raw = localStorage.getItem('selectedAccount');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Account;
  } catch {
    return null;
  }
};

export const AccountProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(readStoredAccount);
  const [isLoading, setIsLoading] = useState(true);

  const createAccount = useCallback(async (data: Partial<Account>) => {
    const newAccount = await apiJson<Account>('/api/accounts', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    setAccounts((prev) => [...prev, newAccount]);
    return newAccount;
  }, []);

  const fetchAccounts = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await apiJson<Account[]>('/api/accounts');
      setAccounts(data);

      if (data.length > 0) {
        setSelectedAccount((prev) => {
          const match = prev ? data.find((a) => a.id === prev.id) : undefined;
          return match ?? data[0];
        });
      } else {
        try {
          const created = await createAccount({
            name: 'Default',
            type: 'normal',
            icon: 'wallet',
          });
          setSelectedAccount(created);
        } catch (e) {
          console.error('Failed to create default account', e);
        }
      }
    } catch (error) {
      console.error('Failed to fetch accounts', error);
    } finally {
      setIsLoading(false);
    }
  }, [createAccount]);

  useEffect(() => {
    if (user) {
      fetchAccounts();
    } else {
      setIsLoading(false);
      setAccounts([]);
      setSelectedAccount(null);
    }
  }, [user, fetchAccounts]);

  useEffect(() => {
    if (selectedAccount) {
      localStorage.setItem('selectedAccount', JSON.stringify(selectedAccount));
    } else {
      localStorage.removeItem('selectedAccount');
    }
  }, [selectedAccount]);

  const updateAccount = async (id: string, data: Partial<Account>) => {
    const updatedAccount = await apiJson<Account>(`/api/accounts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    setAccounts((prev) => prev.map((a) => (a.id === id ? updatedAccount : a)));
    if (selectedAccount?.id === id) {
      setSelectedAccount(updatedAccount);
    }
    return updatedAccount;
  };

  const deleteAccount = async (id: string) => {
    await apiJson(`/api/accounts/${id}`, { method: 'DELETE' });
    setAccounts((prev) => prev.filter((a) => a.id !== id));
    if (selectedAccount?.id === id) {
      const remaining = accounts.filter((a) => a.id !== id);
      setSelectedAccount(remaining.length > 0 ? remaining[0] : null);
    }
  };

  const selectAccount = (account: Account) => {
    setSelectedAccount(account);
  };

  return (
    <AccountContext.Provider
      value={{
        accounts,
        selectedAccount,
        isLoading,
        fetchAccounts,
        createAccount,
        updateAccount,
        deleteAccount,
        selectAccount,
      }}
    >
      {children}
    </AccountContext.Provider>
  );
};
