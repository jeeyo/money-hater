import type { Context } from 'hono';
import { PrismaClient } from '@prisma/client';
import { PrismaD1 } from '@prisma/adapter-d1';

export type DbBindings = {
  money_hater_db: D1Database;
};

/**
 * Build a Prisma client wired to the D1 binding on the request context.
 * Accepts any Hono context whose Bindings include `money_hater_db`.
 */
export function getPrisma(
  c: Context<{ Bindings: DbBindings & Record<string, unknown> }>,
): PrismaClient;
export function getPrisma(c: { env: DbBindings }): PrismaClient;
export function getPrisma(c: { env: DbBindings }): PrismaClient {
  const adapter = new PrismaD1(c.env.money_hater_db);
  return new PrismaClient({ adapter });
}
