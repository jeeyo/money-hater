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

// Get all accounts for the authenticated user
app.get('/', authMiddleware, async (c) => {
  try {
    const prisma = getPrisma(c);
    const authUser = getAuthUser(c);

    const accounts = await prisma.account.findMany({
      where: {
        userId: authUser.userId
      },
      orderBy: {
        createdAt: 'asc'
      }
    });

    if (accounts.length === 0) {
      // Create default account
      if (!authUser.userId) {
        return c.json({ error: 'Unauthorized' }, 401);
      }
      const defaultAccount = await prisma.account.create({
        data: {
          name: 'Default',
          type: 'normal',
          icon: 'wallet',
          userId: authUser.userId,
          createdAt: Date.now()
        }
      });

      // Migrate existing expenses
      await prisma.expense.updateMany({
        where: {
          userId: authUser.userId,
          accountId: null
        },
        data: {
          accountId: defaultAccount.id
        }
      });

      return c.json([defaultAccount]);
    }

    return c.json(accounts);
  } catch (err) {
    console.error('Get accounts error:', err);
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

// Create a new account
app.post('/', authMiddleware, async (c) => {
  try {
    const prisma = getPrisma(c);
    const authUser = getAuthUser(c);
    const data = await c.req.json() as any;

    if (!data.name) {
      return c.json({ error: 'Account name is required' }, 400);
    }

    if (!authUser.userId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const newAccount = await prisma.account.create({
      data: {
        name: data.name,
        type: data.type || 'normal',
        icon: data.icon,
        userId: authUser.userId,
        createdAt: Date.now()
      }
    });

    return c.json(newAccount, 201);
  } catch (err) {
    console.error('Create account error:', err);
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

// Update an account
app.put('/:id', authMiddleware, async (c) => {
  try {
    const prisma = getPrisma(c);
    const authUser = getAuthUser(c);
    const id = c.req.param('id');
    const data = await c.req.json() as any;

    const existingAccount = await prisma.account.findFirst({
      where: {
        id,
        userId: authUser.userId
      }
    });

    if (!existingAccount) {
      return c.json({ error: 'Account not found' }, 404);
    }

    const updatedAccount = await prisma.account.update({
      where: { id },
      data: {
        name: data.name,
        type: data.type,
        icon: data.icon
      }
    });

    return c.json(updatedAccount);
  } catch (err) {
    console.error('Update account error:', err);
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

// Delete an account
app.delete('/:id', authMiddleware, async (c) => {
  try {
    const prisma = getPrisma(c);
    const authUser = getAuthUser(c);
    const id = c.req.param('id');

    const existingAccount = await prisma.account.findFirst({
      where: {
        id,
        userId: authUser.userId
      }
    });

    if (!existingAccount) {
      return c.json({ error: 'Account not found' }, 404);
    }

    // Check if it's the last account? Maybe not enforce it here but frontend should warn.
    // Or we can prevent deleting the last account.
    const accountCount = await prisma.account.count({
      where: { userId: authUser.userId }
    });

    if (accountCount <= 1) {
      return c.json({ error: 'Cannot delete the last account' }, 400);
    }

    await prisma.account.delete({
      where: { id }
    });

    return c.body(null, 204);
  } catch (err) {
    console.error('Delete account error:', err);
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

export default app;
