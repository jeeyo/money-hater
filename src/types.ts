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
