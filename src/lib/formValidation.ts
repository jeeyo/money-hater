import { z } from 'zod';
import { ExpenseCategory, IncomeCategory } from '../types';

// Client-side schemas mirror the worker zod schemas in worker/validation.ts.
// Kept in sync manually; both sides validate the same shape so the user gets
// immediate feedback without a round-trip and the server still rejects bad
// input from any client.

const ALL_CATEGORY_VALUES = [
  ...Object.values(ExpenseCategory),
  ...Object.values(IncomeCategory),
] as const;

const tagsSchema = z
  .array(z.string().trim().min(1, 'Tag cannot be empty').max(40, 'Tag too long'))
  .max(20, 'Too many tags');

export const expenseFormSchema = z
  .object({
    description: z
      .string()
      .trim()
      .min(1, 'Description is required')
      .max(500, 'Description must be 500 characters or fewer'),
    amount: z
      .number()
      .finite('Amount must be a number')
      .gt(0, 'Amount must be greater than zero')
      .max(1_000_000_000, 'Amount is too large'),
    date: z
      .string()
      .min(1, 'Date is required')
      .refine((v) => !Number.isNaN(Date.parse(v)), 'Invalid date'),
    type: z.enum(['expense', 'income']),
    category: z.enum(ALL_CATEGORY_VALUES as unknown as [string, ...string[]]),
    tags: tagsSchema,
  })
  .strict();

export type ExpenseFormValues = z.infer<typeof expenseFormSchema>;

export const budgetFormSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(80, 'Name is too long'),
    amount: z
      .number()
      .finite('Amount must be a number')
      .positive('Amount must be greater than zero')
      .max(1_000_000_000, 'Amount is too large'),
    startDate: z
      .string()
      .min(1, 'Start date is required')
      .refine((v) => !Number.isNaN(Date.parse(v)), 'Invalid date'),
    endDate: z
      .string()
      .min(1, 'End date is required')
      .refine((v) => !Number.isNaN(Date.parse(v)), 'Invalid date'),
    categories: z.array(z.string()).max(20),
    tags: tagsSchema,
    accountId: z.string().optional(),
  })
  .strict()
  .refine((v) => Date.parse(v.endDate) >= Date.parse(v.startDate), {
    message: 'End date must be on or after start date',
    path: ['endDate'],
  });

export type BudgetFormValues = z.infer<typeof budgetFormSchema>;

export type FieldErrors<T> = Partial<Record<keyof T, string>>;

export function flattenErrors<T>(error: z.ZodError): FieldErrors<T> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? '_');
    if (!out[key]) out[key] = issue.message;
  }
  return out as FieldErrors<T>;
}
