import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { authMiddleware, getAuthUser } from './middleware';
import { getPrisma, type DbBindings } from './db';
import { createBudgetSchema, updateBudgetSchema } from './validation';
import { syncBudgetTags } from './tags';

const app = new Hono<{ Bindings: DbBindings }>();

function safeParseStringArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === 'string') : [];
  } catch {
    return [];
  }
}

// Get all budgets for the authenticated user with spent amount.
//
// Performance: one query across the union of all budget date ranges with
// in-memory partitioning. Tag filtering uses the ExpenseTag join (Phase 5):
// we fetch matching expense ids per tag set in SQL, then check membership
// while we partition by date range and category.
app.get('/', authMiddleware, async (c) => {
  try {
    const prisma = getPrisma(c);
    const authUser = getAuthUser(c);

    const budgets = await prisma.budget.findMany({
      where: { userId: authUser.userId },
      orderBy: { createdAt: 'desc' },
      include: {
        tagLinks: { include: { tag: { select: { name: true } } } },
      },
    });

    if (budgets.length === 0) return c.json([]);

    let minStart = budgets[0].startDate;
    let maxEnd = budgets[0].endDate;
    for (const b of budgets) {
      if (b.startDate < minStart) minStart = b.startDate;
      if (b.endDate > maxEnd) maxEnd = b.endDate;
    }

    // Eligibility set per budget: when a budget filters by tags, only
    // expenses whose ExpenseTag links include at least one of those tags
    // count. We pre-compute the eligible expense id set for each
    // tag-filtered budget so the in-memory loop below is O(1) per check.
    const tagFilterSets = new Map<string, Set<string>>();
    for (const b of budgets) {
      const tagNames = b.tagLinks.map((tl) => tl.tag.name);
      if (tagNames.length === 0) continue;
      const links = await prisma.expenseTag.findMany({
        where: {
          tag: { userId: authUser.userId, name: { in: tagNames } },
          expense: {
            userId: authUser.userId,
            date: { gte: b.startDate, lte: b.endDate },
            ...(b.accountId ? { accountId: b.accountId } : {}),
          },
        },
        select: { expenseId: true },
      });
      tagFilterSets.set(b.id, new Set(links.map((l) => l.expenseId)));
    }

    const allExpenses = await prisma.expense.findMany({
      where: {
        userId: authUser.userId,
        date: { gte: minStart, lte: maxEnd },
      },
      select: { id: true, amount: true, category: true, accountId: true, date: true },
    });

    const budgetsWithStats = budgets.map((budget) => {
      const categories = safeParseStringArray(budget.categories);
      const tagNames = budget.tagLinks.map((tl) => tl.tag.name);
      const categorySet = categories.length > 0 ? new Set(categories) : null;
      const tagAllowList = tagFilterSets.get(budget.id) ?? null;

      let spent = 0;
      for (const exp of allExpenses) {
        if (exp.date < budget.startDate || exp.date > budget.endDate) continue;
        if (budget.accountId && exp.accountId !== budget.accountId) continue;
        if (categorySet && !categorySet.has(exp.category)) continue;
        if (tagAllowList && !tagAllowList.has(exp.id)) continue;
        spent += exp.amount;
      }

      const { tagLinks: _tagLinks, ...rest } = budget;
      return { ...rest, categories, tags: tagNames, spent };
    });

    return c.json(budgetsWithStats);
  } catch (err) {
    console.error('Get budgets error:', err);
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

app.get('/:id', authMiddleware, async (c) => {
  try {
    const prisma = getPrisma(c);
    const authUser = getAuthUser(c);
    const id = c.req.param('id');

    const budget = await prisma.budget.findFirst({
      where: { id, userId: authUser.userId },
      include: {
        tagLinks: { include: { tag: { select: { name: true } } } },
      },
    });

    if (!budget) return c.json({ error: 'Budget not found' }, 404);

    const categories = safeParseStringArray(budget.categories);
    const tagNames = budget.tagLinks.map((tl) => tl.tag.name);

    const whereClause: {
      userId: string;
      date: { gte: Date; lte: Date };
      accountId?: string;
      category?: { in: string[] };
      tagLinks?: { some: { tag: { userId: string; name: { in: string[] } } } };
    } = {
      userId: authUser.userId,
      date: { gte: budget.startDate, lte: budget.endDate },
    };

    if (budget.accountId) whereClause.accountId = budget.accountId;
    if (categories.length > 0) whereClause.category = { in: categories };
    if (tagNames.length > 0) {
      whereClause.tagLinks = {
        some: { tag: { userId: authUser.userId, name: { in: tagNames } } },
      };
    }

    const expenses = await prisma.expense.findMany({
      where: whereClause,
      orderBy: { date: 'desc' },
    });

    const spent = expenses.reduce((sum, exp) => sum + exp.amount, 0);

    const transactions = expenses.map((exp) => ({
      ...exp,
      tags: safeParseStringArray(exp.tags),
    }));

    const { tagLinks: _tagLinks, ...rest } = budget;
    return c.json({ ...rest, categories, tags: tagNames, spent, transactions });
  } catch (err) {
    console.error('Get budget error:', err);
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

app.post('/', authMiddleware, zValidator('json', createBudgetSchema), async (c) => {
  try {
    const prisma = getPrisma(c);
    const authUser = getAuthUser(c);
    const data = c.req.valid('json');

    if (data.accountId) {
      const owns = await prisma.account.findFirst({
        where: { id: data.accountId, userId: authUser.userId },
        select: { id: true },
      });
      if (!owns) return c.json({ error: 'Invalid accountId' }, 400);
    }

    const newBudget = await prisma.budget.create({
      data: {
        name: data.name,
        amount: data.amount,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        categories: JSON.stringify(data.categories),
        tags: JSON.stringify(data.tags),
        accountId: data.accountId ?? null,
        userId: authUser.userId,
        createdAt: Date.now(),
      },
    });

    await syncBudgetTags(prisma, authUser.userId, newBudget.id, data.tags);

    return c.json(
      {
        ...newBudget,
        categories: safeParseStringArray(newBudget.categories),
        tags: safeParseStringArray(newBudget.tags),
        spent: 0,
      },
      201,
    );
  } catch (err) {
    console.error('Create budget error:', err);
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

app.put('/:id', authMiddleware, zValidator('json', updateBudgetSchema), async (c) => {
  try {
    const prisma = getPrisma(c);
    const authUser = getAuthUser(c);
    const id = c.req.param('id');
    const data = c.req.valid('json');

    const existingBudget = await prisma.budget.findFirst({
      where: { id, userId: authUser.userId },
    });

    if (!existingBudget) return c.json({ error: 'Budget not found' }, 404);

    if (data.accountId) {
      const owns = await prisma.account.findFirst({
        where: { id: data.accountId, userId: authUser.userId },
        select: { id: true },
      });
      if (!owns) return c.json({ error: 'Invalid accountId' }, 400);
    }

    const updatedBudget = await prisma.budget.update({
      where: { id },
      data: {
        name: data.name,
        amount: data.amount,
        startDate: data.startDate ? new Date(data.startDate) : undefined,
        endDate: data.endDate ? new Date(data.endDate) : undefined,
        categories: data.categories ? JSON.stringify(data.categories) : undefined,
        tags: data.tags ? JSON.stringify(data.tags) : undefined,
        accountId: data.accountId,
      },
    });

    if (data.tags) {
      await syncBudgetTags(prisma, authUser.userId, id, data.tags);
    }

    return c.json({
      ...updatedBudget,
      categories: safeParseStringArray(updatedBudget.categories),
      tags: safeParseStringArray(updatedBudget.tags),
    });
  } catch (err) {
    console.error('Update budget error:', err);
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

app.delete('/:id', authMiddleware, async (c) => {
  try {
    const prisma = getPrisma(c);
    const authUser = getAuthUser(c);
    const id = c.req.param('id');

    const existingBudget = await prisma.budget.findFirst({
      where: { id, userId: authUser.userId },
    });

    if (!existingBudget) return c.json({ error: 'Budget not found' }, 404);

    await prisma.budget.delete({ where: { id } });
    return c.body(null, 204);
  } catch (err) {
    console.error('Delete budget error:', err);
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

export default app;
