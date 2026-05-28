import { z } from 'zod';
import { PASSWORD_MIN_LENGTH, PASSWORD_POLICY_MESSAGE, MAX_DESCRIPTION_LENGTH } from './security';

const EXPENSE_CATEGORIES = [
  'Food & Dining',
  'Transportation',
  'Housing',
  'Utilities',
  'Entertainment',
  'Shopping',
  'Health & Fitness',
  'Travel',
  'Education',
  'Business',
  'Groceries',
  'Other',
] as const;

const INCOME_CATEGORIES = ['Salary', 'Freelance', 'Investment', 'Gift', 'Other Income'] as const;

const ALL_CATEGORIES = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES] as const;

export const ExpenseCategoryEnum = z.enum(EXPENSE_CATEGORIES);
export const expenseCategoryValues = EXPENSE_CATEGORIES;
const AllCategoryEnum = z.enum(ALL_CATEGORIES);

const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, PASSWORD_POLICY_MESSAGE)
  .max(200, 'Password is too long.')
  .refine((p) => /[A-Za-z]/.test(p), PASSWORD_POLICY_MESSAGE)
  .refine((p) => /[0-9!@#$%^&*()_\-+=[\]{};:'",.<>/?\\|`~]/.test(p), PASSWORD_POLICY_MESSAGE);

const usernameSchema = z
  .string()
  .trim()
  .min(3, 'Username must be at least 3 characters')
  .max(32, 'Username must be at most 32 characters')
  .regex(/^[A-Za-z0-9._-]+$/, 'Username may only contain letters, numbers, dot, dash, underscore');

const emailSchema = z.string().trim().toLowerCase().email('Invalid email').max(254);

const turnstileTokenSchema = z.string().min(1).max(2048).optional();

// ---------- Auth ----------

export const completeRegistrationSchema = z
  .object({
    token: z.string().min(1).max(4096),
    password: passwordSchema,
  })
  .strict();

export const loginSchema = z
  .object({
    username: usernameSchema,
    password: z.string().min(1).max(200),
    turnstileToken: turnstileTokenSchema,
  })
  .strict();

export const forgotPasswordSchema = z
  .object({
    email: emailSchema,
    turnstileToken: turnstileTokenSchema,
  })
  .strict();

export const resetPasswordSchema = z
  .object({
    token: z
      .string()
      .min(1)
      .max(256)
      .regex(/^[a-f0-9]+$/i, 'Invalid token format'),
    password: passwordSchema,
  })
  .strict();

// ---------- Expenses ----------

const isoDateSchema = z
  .string()
  .min(1)
  .max(64)
  .refine((v) => !Number.isNaN(Date.parse(v)), 'Invalid date');

const tagsSchema = z.array(z.string().trim().min(1).max(40)).max(20).default([]);

const latitudeSchema = z.coerce.number().gte(-90).lte(90).optional().nullable();
const longitudeSchema = z.coerce.number().gte(-180).lte(180).optional().nullable();
const placeNameSchema = z.string().trim().max(200).optional().nullable();
const placeIdSchema = z.string().trim().max(256).optional().nullable();

export const createExpenseSchema = z
  .object({
    description: z.string().trim().min(1).max(500),
    amount: z.coerce.number().finite().min(-1_000_000_000).max(1_000_000_000),
    date: isoDateSchema.optional(),
    type: z.enum(['expense', 'income']).default('expense'),
    category: AllCategoryEnum.default('Other'),
    tags: tagsSchema,
    attachmentUrl: z.string().max(512).optional().nullable(),
    accountId: z.string().uuid().optional().nullable(),
    createdAt: z.coerce.number().finite().optional(),
    latitude: latitudeSchema,
    longitude: longitudeSchema,
    placeName: placeNameSchema,
    placeId: placeIdSchema,
    // Allow legacy/extra fields; we ignore the rest of payload.
  })
  .passthrough();

export const updateExpenseSchema = z
  .object({
    description: z.string().trim().min(1).max(500).optional(),
    amount: z.coerce.number().finite().min(-1_000_000_000).max(1_000_000_000).optional(),
    date: isoDateSchema.optional(),
    type: z.enum(['expense', 'income']).optional(),
    category: AllCategoryEnum.optional(),
    tags: tagsSchema.optional(),
    attachmentUrl: z.string().max(512).optional().nullable(),
    accountId: z.string().uuid().optional().nullable(),
    latitude: latitudeSchema,
    longitude: longitudeSchema,
    placeName: placeNameSchema,
    placeId: placeIdSchema,
  })
  .passthrough();

// ---------- Accounts ----------

export const createAccountSchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    type: z.string().trim().min(1).max(40).default('normal'),
    icon: z.string().trim().max(40).optional().nullable(),
  })
  .strict();

export const updateAccountSchema = z
  .object({
    name: z.string().trim().min(1).max(60).optional(),
    type: z.string().trim().min(1).max(40).optional(),
    icon: z.string().trim().max(40).optional().nullable(),
  })
  .strict();

// ---------- Budgets ----------

const budgetCategoriesSchema = z.array(ExpenseCategoryEnum).max(20).default([]);

export const createBudgetSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    amount: z.coerce.number().finite().positive().max(1_000_000_000),
    startDate: isoDateSchema,
    endDate: isoDateSchema,
    categories: budgetCategoriesSchema,
    tags: tagsSchema,
    accountId: z.string().uuid().optional().nullable(),
  })
  .strict()
  .refine((v) => Date.parse(v.endDate) >= Date.parse(v.startDate), {
    message: 'endDate must be on or after startDate',
    path: ['endDate'],
  });

export const updateBudgetSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    amount: z.coerce.number().finite().positive().max(1_000_000_000).optional(),
    startDate: isoDateSchema.optional(),
    endDate: isoDateSchema.optional(),
    categories: budgetCategoriesSchema.optional(),
    tags: tagsSchema.optional(),
    accountId: z.string().uuid().optional().nullable(),
  })
  .strict();

// ---------- AI / classification ----------

export const classifyExpenseSchema = z
  .object({
    description: z.string().trim().min(1).max(MAX_DESCRIPTION_LENGTH),
    amount: z.coerce.number().finite().optional(),
    // Optional device GPS captured at entry; lets the agent reverse-geocode the
    // real coordinates instead of guessing the place from text.
    latitude: z.coerce.number().gte(-90).lte(90).optional(),
    longitude: z.coerce.number().gte(-180).lte(180).optional(),
  })
  .strict();

// ---------- AI / assistant ----------

export const assistantSchema = z
  .object({
    messages: z
      .array(
        z
          .object({
            role: z.enum(['user', 'assistant']),
            content: z.string().trim().min(1).max(4000),
          })
          .strict(),
      )
      .min(1)
      .max(20),
  })
  .strict();
