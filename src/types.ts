export enum ExpenseCategory {
  FOOD = 'Food & Dining',
  TRANSPORT = 'Transportation',
  HOUSING = 'Housing',
  UTILITIES = 'Utilities',
  ENTERTAINMENT = 'Entertainment',
  SHOPPING = 'Shopping',
  HEALTH = 'Health & Fitness',
  TRAVEL = 'Travel',
  EDUCATION = 'Education',
  BUSINESS = 'Business',
  GROCERIES = 'Groceries',
  OTHER = 'Other'
}

export enum IncomeCategory {
  SALARY = 'Salary',
  FREELANCE = 'Freelance',
  INVESTMENT = 'Investment',
  GIFT = 'Gift',
  OTHER = 'Other Income'
}

export type TransactionType = 'income' | 'expense';

export interface Expense {
  id: string;
  description: string;
  amount: number;
  date: string;
  type: TransactionType;
  category: ExpenseCategory | IncomeCategory;
  tags: string[];
  createdAt: number;
}

export interface AIClassificationResult {
  type?: TransactionType;
  category: ExpenseCategory | IncomeCategory;
  tags: string[];
  predictedAmount?: number;
}

export interface User {
  id: string;
  username: string;
  password?: string; // Optional because we don't want to send it back to client
  email: string;
  name: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}
