import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { jwtOnly, getAuthUser } from './middleware';
import { getPrisma, type DbBindings } from './db';
import { generateApiToken, hashToken, apiTokenPrefix } from './tokens';

const app = new Hono<{ Bindings: DbBindings }>();

const createSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    // Optional ISO datetime. If omitted the token never expires.
    expiresAt: z
      .string()
      .refine((v) => !Number.isNaN(Date.parse(v)), 'Invalid date')
      .optional()
      .nullable(),
  })
  .strict();

// All routes are jwtOnly: an API token must not be usable to mint more API
// tokens or list/revoke sessions. Otherwise a leaked token could be used
// to establish persistence.

app.post('/', jwtOnly, zValidator('json', createSchema), async (c) => {
  try {
    const prisma = getPrisma(c);
    const u = getAuthUser(c);
    const { name, expiresAt } = c.req.valid('json');

    const plaintext = generateApiToken();
    const created = await prisma.apiToken.create({
      data: {
        userId: u.userId,
        name,
        tokenHash: await hashToken(plaintext),
        prefix: apiTokenPrefix(plaintext),
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
    });

    // Only response that ever contains the plaintext token.
    return c.json(
      {
        id: created.id,
        name: created.name,
        prefix: created.prefix,
        expiresAt: created.expiresAt,
        lastUsedAt: created.lastUsedAt,
        createdAt: created.createdAt,
        token: plaintext,
      },
      201,
    );
  } catch (err) {
    console.error('Create API token error:', err);
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

app.get('/', jwtOnly, async (c) => {
  try {
    const prisma = getPrisma(c);
    const u = getAuthUser(c);
    const rows = await prisma.apiToken.findMany({
      where: { userId: u.userId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        prefix: true,
        expiresAt: true,
        lastUsedAt: true,
        createdAt: true,
      },
    });
    return c.json(rows);
  } catch (err) {
    console.error('List API tokens error:', err);
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

app.delete('/:id', jwtOnly, async (c) => {
  try {
    const prisma = getPrisma(c);
    const u = getAuthUser(c);
    const id = c.req.param('id');
    const existing = await prisma.apiToken.findFirst({
      where: { id, userId: u.userId, revokedAt: null },
    });
    if (!existing) return c.json({ error: 'API token not found' }, 404);
    await prisma.apiToken.update({ where: { id }, data: { revokedAt: new Date() } });
    return c.body(null, 204);
  } catch (err) {
    console.error('Delete API token error:', err);
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

export default app;
