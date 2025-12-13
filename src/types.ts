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
  attachmentUrl?: string;
  createdAt: number;
  accountId?: string;
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

export interface Budget {
  id: string;
  name: string;
  amount: number;
  startDate: string;
  endDate: string;
  categories: string[];
  tags: string[];
  userId: string;
  accountId?: string;
  createdAt: number;
}

export interface BudgetWithStats extends Budget {
  spent: number;
}

export enum NotificationType {
  INFO = 'info',
  SUCCESS = 'success',
  WARNING = 'warning',
  ERROR = 'error'
}

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: NotificationType;
  timestamp: number;
  read: boolean;
  link?: string;
}
