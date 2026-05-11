import { describe, expect, it } from 'vitest';
import {
  expenseFormSchema,
  budgetFormSchema,
  flattenErrors,
  type ExpenseFormValues,
  type BudgetFormValues,
} from '../formValidation';

describe('expenseFormSchema', () => {
  const valid = {
    description: 'Coffee',
    amount: 5,
    date: '2026-01-01',
    type: 'expense' as const,
    category: 'Food & Dining',
    tags: ['caffeine'],
  };

  it('accepts a valid expense', () => {
    const r = expenseFormSchema.safeParse(valid);
    expect(r.success).toBe(true);
  });

  it('rejects empty description', () => {
    const r = expenseFormSchema.safeParse({ ...valid, description: '   ' });
    expect(r.success).toBe(false);
    if (!r.success) {
      const errs = flattenErrors<ExpenseFormValues>(r.error);
      expect(errs.description).toMatch(/required/i);
    }
  });

  it('rejects non-positive amount', () => {
    const r = expenseFormSchema.safeParse({ ...valid, amount: 0 });
    expect(r.success).toBe(false);
    if (!r.success) {
      const errs = flattenErrors<ExpenseFormValues>(r.error);
      expect(errs.amount).toMatch(/greater than zero/i);
    }
  });

  it('rejects non-finite amount', () => {
    const r = expenseFormSchema.safeParse({ ...valid, amount: Number.POSITIVE_INFINITY });
    expect(r.success).toBe(false);
  });

  it('rejects an unparseable date', () => {
    const r = expenseFormSchema.safeParse({ ...valid, date: 'tomorrow' });
    expect(r.success).toBe(false);
    if (!r.success) {
      const errs = flattenErrors<ExpenseFormValues>(r.error);
      expect(errs.date).toBeDefined();
    }
  });

  it('caps tags at 20', () => {
    const tags = Array.from({ length: 21 }, (_, i) => `t${i}`);
    const r = expenseFormSchema.safeParse({ ...valid, tags });
    expect(r.success).toBe(false);
  });
});

describe('budgetFormSchema', () => {
  const valid = {
    name: 'Groceries',
    amount: 1000,
    startDate: '2026-01-01',
    endDate: '2026-01-31',
    categories: ['Food & Dining'],
    tags: [],
  };

  it('accepts a valid budget', () => {
    const r = budgetFormSchema.safeParse(valid);
    expect(r.success).toBe(true);
  });

  it('rejects when end is before start', () => {
    const r = budgetFormSchema.safeParse({
      ...valid,
      startDate: '2026-02-01',
      endDate: '2026-01-01',
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      const errs = flattenErrors<BudgetFormValues>(r.error);
      expect(errs.endDate).toMatch(/on or after/i);
    }
  });

  it('rejects negative amount', () => {
    const r = budgetFormSchema.safeParse({ ...valid, amount: -1 });
    expect(r.success).toBe(false);
  });

  it('rejects empty name', () => {
    const r = budgetFormSchema.safeParse({ ...valid, name: '' });
    expect(r.success).toBe(false);
    if (!r.success) {
      const errs = flattenErrors<BudgetFormValues>(r.error);
      expect(errs.name).toMatch(/required/i);
    }
  });
});
