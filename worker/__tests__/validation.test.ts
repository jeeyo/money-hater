import { describe, expect, it } from 'vitest';
import {
  loginSchema,
  resetPasswordSchema,
  createExpenseSchema,
  createBudgetSchema,
  classifyExpenseSchema,
} from '../validation';

describe('loginSchema', () => {
  it('accepts a normal payload', () => {
    const r = loginSchema.safeParse({ username: 'alice', password: 'pw1234' });
    expect(r.success).toBe(true);
  });

  it('rejects empty fields', () => {
    expect(loginSchema.safeParse({ username: '', password: '' }).success).toBe(false);
  });

  it('rejects extra unknown fields (strict mode)', () => {
    const r = loginSchema.safeParse({
      username: 'alice',
      password: 'pw1234',
      isAdmin: true,
    });
    expect(r.success).toBe(false);
  });
});

describe('resetPasswordSchema', () => {
  it('accepts a 64-char hex token + strong password', () => {
    const r = resetPasswordSchema.safeParse({
      token: 'a'.repeat(64),
      password: 'StrongPass1!',
    });
    expect(r.success).toBe(true);
  });

  it('rejects non-hex tokens', () => {
    const r = resetPasswordSchema.safeParse({
      token: 'not!a!hex!token',
      password: 'StrongPass1!',
    });
    expect(r.success).toBe(false);
  });

  it('enforces password policy', () => {
    const r = resetPasswordSchema.safeParse({
      token: 'a'.repeat(64),
      password: 'short',
    });
    expect(r.success).toBe(false);
  });
});

describe('createExpenseSchema', () => {
  it('coerces numeric amounts and applies defaults', () => {
    const r = createExpenseSchema.safeParse({
      description: 'Coffee',
      amount: '4.50',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.amount).toBe(4.5);
      expect(r.data.type).toBe('expense');
      expect(r.data.category).toBe('Other');
      expect(r.data.tags).toEqual([]);
    }
  });

  it('rejects descriptions over 500 chars', () => {
    const r = createExpenseSchema.safeParse({
      description: 'x'.repeat(501),
      amount: 1,
    });
    expect(r.success).toBe(false);
  });

  it('rejects garbage amounts', () => {
    const r = createExpenseSchema.safeParse({
      description: 'Coffee',
      amount: 'abc',
    });
    expect(r.success).toBe(false);
  });

  it('caps tag count at 20', () => {
    const r = createExpenseSchema.safeParse({
      description: 'x',
      amount: 1,
      tags: Array.from({ length: 25 }, (_, i) => `t${i}`),
    });
    expect(r.success).toBe(false);
  });
});

describe('createBudgetSchema', () => {
  it('rejects an end date before the start date', () => {
    const r = createBudgetSchema.safeParse({
      name: 'Q4',
      amount: 1000,
      startDate: '2025-01-31',
      endDate: '2025-01-01',
      categories: [],
      tags: [],
    });
    expect(r.success).toBe(false);
  });

  it('accepts a same-day budget', () => {
    const r = createBudgetSchema.safeParse({
      name: 'Day Out',
      amount: 100,
      startDate: '2025-06-01',
      endDate: '2025-06-01',
      categories: [],
      tags: [],
    });
    expect(r.success).toBe(true);
  });

  it('rejects negative amounts', () => {
    const r = createBudgetSchema.safeParse({
      name: 'Bad',
      amount: -10,
      startDate: '2025-01-01',
      endDate: '2025-12-31',
      categories: [],
      tags: [],
    });
    expect(r.success).toBe(false);
  });
});

describe('classifyExpenseSchema', () => {
  it('caps description at 500 chars', () => {
    const r = classifyExpenseSchema.safeParse({ description: 'x'.repeat(600) });
    expect(r.success).toBe(false);
  });

  it('treats amount as optional', () => {
    const r = classifyExpenseSchema.safeParse({ description: 'Coffee' });
    expect(r.success).toBe(true);
  });
});
