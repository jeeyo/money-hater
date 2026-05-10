import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { authMiddleware, getAuthUser } from './middleware';
import { getPrisma, type DbBindings } from './db';
import { createAccountSchema, updateAccountSchema } from './validation';

const app = new Hono<{ Bindings: DbBindings }>();

// Get all accounts for the authenticated user. Auto-creates a default account
// on first call so existing un-bucketed expenses get a home.
app.get('/', authMiddleware, async (c) => {
  try {
    const prisma = getPrisma(c);
    const authUser = getAuthUser(c);

    const accounts = await prisma.account.findMany({
      where: { userId: authUser.userId },
      orderBy: { createdAt: 'asc' },
    });

    if (accounts.length === 0) {
      const defaultAccount = await prisma.account.create({
        data: {
          name: 'Default',
          type: 'normal',
          icon: 'wallet',
          userId: authUser.userId,
          createdAt: Date.now(),
        },
      });

      await prisma.expense.updateMany({
        where: { userId: authUser.userId, accountId: null },
        data: { accountId: defaultAccount.id },
      });

      return c.json([defaultAccount]);
    }

    return c.json(accounts);
  } catch (err) {
    console.error('Get accounts error:', err);
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

app.post('/', authMiddleware, zValidator('json', createAccountSchema), async (c) => {
  try {
    const prisma = getPrisma(c);
    const authUser = getAuthUser(c);
    const data = c.req.valid('json');

    const newAccount = await prisma.account.create({
      data: {
        name: data.name,
        type: data.type,
        icon: data.icon ?? null,
        userId: authUser.userId,
        createdAt: Date.now(),
      },
    });

    return c.json(newAccount, 201);
  } catch (err) {
    console.error('Create account error:', err);
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

app.put('/:id', authMiddleware, zValidator('json', updateAccountSchema), async (c) => {
  try {
    const prisma = getPrisma(c);
    const authUser = getAuthUser(c);
    const id = c.req.param('id');
    const data = c.req.valid('json');

    const existingAccount = await prisma.account.findFirst({
      where: { id, userId: authUser.userId },
    });

    if (!existingAccount) {
      return c.json({ error: 'Account not found' }, 404);
    }

    const updatedAccount = await prisma.account.update({
      where: { id },
      data: { name: data.name, type: data.type, icon: data.icon },
    });

    return c.json(updatedAccount);
  } catch (err) {
    console.error('Update account error:', err);
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

app.delete('/:id', authMiddleware, async (c) => {
  try {
    const prisma = getPrisma(c);
    const authUser = getAuthUser(c);
    const id = c.req.param('id');

    const existingAccount = await prisma.account.findFirst({
      where: { id, userId: authUser.userId },
    });

    if (!existingAccount) {
      return c.json({ error: 'Account not found' }, 404);
    }

    const accountCount = await prisma.account.count({
      where: { userId: authUser.userId },
    });

    if (accountCount <= 1) {
      return c.json({ error: 'Cannot delete the last account' }, 400);
    }

    await prisma.account.delete({ where: { id } });

    return c.body(null, 204);
  } catch (err) {
    console.error('Delete account error:', err);
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

export default app;
