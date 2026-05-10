import { createContext } from 'react';

export interface Account {
  id: string;
  name: string;
  type: string;
  icon?: string;
  userId: string;
  createdAt: number;
}

export interface AccountContextType {
  accounts: Account[];
  selectedAccount: Account | null;
  isLoading: boolean;
  fetchAccounts: () => Promise<void>;
  createAccount: (data: Partial<Account>) => Promise<Account>;
  updateAccount: (id: string, data: Partial<Account>) => Promise<Account>;
  deleteAccount: (id: string) => Promise<void>;
  selectAccount: (account: Account) => void;
}

export const AccountContext = createContext<AccountContextType | undefined>(undefined);
