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

export interface Expense {
  id: string;
  description: string;
  amount: number;
  date: string;
  category: ExpenseCategory;
  tags: string[];
  createdAt: number;
}

export interface AIClassificationResult {
  category: ExpenseCategory;
  tags: string[];
  predictedAmount?: number;
}
