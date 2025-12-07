import { Hono } from 'hono';
import { PrismaClient } from '@prisma/client';
import { PrismaD1 } from '@prisma/adapter-d1';
import { authMiddleware, getAuthUser } from './middleware';

type Bindings = {
  money_hater_db: D1Database;
};

const app = new Hono<{ Bindings: Bindings }>();

// Helper to get Prisma client
const getPrisma = (c: any) => {
  const adapter = new PrismaD1(c.env.money_hater_db);
  return new PrismaClient({ adapter });
};

// Get all budgets for the authenticated user with spent amount
app.get('/', authMiddleware, async (c) => {
  try {
    const prisma = getPrisma(c);
    const authUser = getAuthUser(c);

    const budgets = await prisma.budget.findMany({
      where: {
        userId: authUser.userId
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Calculate spent amount for each budget
    const budgetsWithStats = await Promise.all(budgets.map(async (budget) => {
      const categories: string[] = JSON.parse(budget.categories || '[]');
      const tags: string[] = JSON.parse(budget.tags || '[]');

      // Base filters
      const whereClause: any = {
        userId: authUser.userId,
        date: {
          gte: budget.startDate,
          lte: budget.endDate
        }
      };

      if (budget.accountId) {
        whereClause.accountId = budget.accountId;
      }

      if (categories.length > 0) {
        whereClause.category = {
          in: categories
        };
      }

      // Fetch expenses that match base criteria
      const expenses = await prisma.expense.findMany({
        where: whereClause,
        select: {
          amount: true,
          tags: true
        }
      });

      // Filter by tags in memory (since tags are stored as JSON string)
      let filteredExpenses = expenses;
      if (tags.length > 0) {
        filteredExpenses = expenses.filter(exp => {
          try {
            const expTags: string[] = JSON.parse(exp.tags);
            // Check if any of the budget tags are present in expense tags
            return tags.some(tag => expTags.includes(tag));
          } catch (e) {
            return false;
          }
        });
      }

      const spent = filteredExpenses.reduce((sum, exp) => sum + exp.amount, 0);

      return {
        ...budget,
        categories,
        tags,
        spent
      };
    }));

    return c.json(budgetsWithStats);
  } catch (err) {
    console.error('Get budgets error:', err);
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

// Create a new budget
app.post('/', authMiddleware, async (c) => {
  try {
    const prisma = getPrisma(c);
    const authUser = getAuthUser(c);
    const data = await c.req.json() as any;

    if (!data.name || !data.amount || !data.startDate || !data.endDate) {
      return c.json({ error: 'Missing required fields' }, 400);
    }

    const newBudget = await prisma.budget.create({
      data: {
        name: data.name,
        amount: parseFloat(data.amount),
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        categories: JSON.stringify(data.categories || []),
        tags: JSON.stringify(data.tags || []),
        accountId: data.accountId || null,
        userId: authUser.userId,
        createdAt: Date.now()
      }
    });

    return c.json({
      ...newBudget,
      categories: JSON.parse(newBudget.categories),
      tags: JSON.parse(newBudget.tags),
      spent: 0
    }, 201);
  } catch (err) {
    console.error('Create budget error:', err);
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

// Update a budget
app.put('/:id', authMiddleware, async (c) => {
  try {
    const prisma = getPrisma(c);
    const authUser = getAuthUser(c);
    const id = c.req.param('id');
    const data = await c.req.json() as any;

    const existingBudget = await prisma.budget.findFirst({
      where: {
        id,
        userId: authUser.userId
      }
    });

    if (!existingBudget) {
      return c.json({ error: 'Budget not found' }, 404);
    }

    const updatedBudget = await prisma.budget.update({
      where: { id },
      data: {
        name: data.name,
        amount: data.amount ? parseFloat(data.amount) : undefined,
        startDate: data.startDate ? new Date(data.startDate) : undefined,
        endDate: data.endDate ? new Date(data.endDate) : undefined,
        categories: data.categories ? JSON.stringify(data.categories) : undefined,
        tags: data.tags ? JSON.stringify(data.tags) : undefined,
        accountId: data.accountId
      }
    });

    return c.json({
      ...updatedBudget,
      categories: JSON.parse(updatedBudget.categories),
      tags: JSON.parse(updatedBudget.tags)
    });
  } catch (err) {
    console.error('Update budget error:', err);
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

// Delete a budget
app.delete('/:id', authMiddleware, async (c) => {
  try {
    const prisma = getPrisma(c);
    const authUser = getAuthUser(c);
    const id = c.req.param('id');

    const existingBudget = await prisma.budget.findFirst({
      where: {
        id,
        userId: authUser.userId
      }
    });

    if (!existingBudget) {
      return c.json({ error: 'Budget not found' }, 404);
    }

    await prisma.budget.delete({
      where: { id }
    });

    return c.body(null, 204);
  } catch (err) {
    console.error('Delete budget error:', err);
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

export default app;
