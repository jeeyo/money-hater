import type { BudgetWithStats, Expense } from '../types';
import { NotificationType } from '../types';

export interface BudgetThresholdAlert {
  budgetId: string;
  budgetName: string;
  threshold: number;
  spent: number;
  amount: number;
  percentage: number;
}

/**
 * Check if a budget has crossed any notification thresholds (50%, 75%, 90%)
 * Returns the highest threshold crossed, or null if none
 */
export function checkBudgetThreshold(
  budget: BudgetWithStats,
  previousSpent: number,
): BudgetThresholdAlert | null {
  const thresholds = [90, 75, 50]; // Check in descending order

  for (const threshold of thresholds) {
    const previousPercentage = (previousSpent / budget.amount) * 100;
    const currentPercentage = (budget.spent / budget.amount) * 100;

    // Check if we just crossed this threshold
    if (previousPercentage < threshold && currentPercentage >= threshold) {
      return {
        budgetId: budget.id,
        budgetName: budget.name,
        threshold,
        spent: budget.spent,
        amount: budget.amount,
        percentage: currentPercentage,
      };
    }
  }

  return null;
}

/**
 * Get notification type based on threshold
 */
export function getNotificationTypeForThreshold(threshold: number): NotificationType {
  if (threshold >= 90) return NotificationType.ERROR;
  if (threshold >= 75) return NotificationType.WARNING;
  return NotificationType.INFO;
}

/**
 * Format notification message for budget threshold
 */
export function formatBudgetThresholdMessage(alert: BudgetThresholdAlert): {
  title: string;
  message: string;
} {
  const remaining = alert.amount - alert.spent;
  const percentageStr = alert.percentage.toFixed(1);

  let title = '';
  if (alert.threshold >= 90) {
    title = '⚠️ Budget Alert!';
  } else if (alert.threshold >= 75) {
    title = '⚡ Budget Warning';
  } else {
    title = '💡 Budget Update';
  }

  const message = `"${alert.budgetName}" is ${percentageStr}% used (฿${alert.spent.toFixed(0)} of ฿${alert.amount.toFixed(0)}). ฿${remaining.toFixed(0)} remaining.`;

  return { title, message };
}

/**
 * Check if a transaction affects any budgets
 * Returns true if the transaction matches budget criteria (categories/tags)
 */
export function doesTransactionAffectBudget(
  transaction: Expense,
  budget: BudgetWithStats,
): boolean {
  // Only expenses affect budgets
  if (transaction.type !== 'expense') return false;

  // Check if transaction matches budget categories
  const hasMatchingCategory =
    budget.categories.length === 0 || budget.categories.includes(transaction.category);

  // Check if transaction matches budget tags
  const hasMatchingTag =
    budget.tags.length === 0 || budget.tags.some((tag) => transaction.tags.includes(tag));

  return hasMatchingCategory && hasMatchingTag;
}
