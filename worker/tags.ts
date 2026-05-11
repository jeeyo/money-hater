import type { PrismaClient } from '@prisma/client';

/**
 * Upsert per-user Tag rows for each unique name and return their ids.
 * Empty / falsy names are dropped. Names are case-sensitive — collapse
 * casing on the client before calling if that's not desired.
 */
export async function upsertTagIds(
  prisma: PrismaClient,
  userId: string,
  names: readonly string[] | null | undefined,
): Promise<string[]> {
  if (!names || names.length === 0) return [];
  const unique = Array.from(
    new Set(names.map((n) => n.trim()).filter((n): n is string => n.length > 0)),
  );
  if (unique.length === 0) return [];

  const ids: string[] = [];
  for (const name of unique) {
    const tag = await prisma.tag.upsert({
      where: { userId_name: { userId, name } },
      create: { id: crypto.randomUUID(), userId, name },
      update: {},
      select: { id: true },
    });
    ids.push(tag.id);
  }
  return ids;
}

/**
 * Replace the join rows for an expense so they exactly match `names`.
 * The legacy JSON `tags` column is updated separately by the caller.
 */
export async function syncExpenseTags(
  prisma: PrismaClient,
  userId: string,
  expenseId: string,
  names: readonly string[] | null | undefined,
): Promise<void> {
  const tagIds = await upsertTagIds(prisma, userId, names);
  await prisma.expenseTag.deleteMany({ where: { expenseId } });
  for (const tagId of tagIds) {
    await prisma.expenseTag.create({ data: { expenseId, tagId } });
  }
}

/**
 * Replace the join rows for a budget so they exactly match `names`.
 */
export async function syncBudgetTags(
  prisma: PrismaClient,
  userId: string,
  budgetId: string,
  names: readonly string[] | null | undefined,
): Promise<void> {
  const tagIds = await upsertTagIds(prisma, userId, names);
  await prisma.budgetTag.deleteMany({ where: { budgetId } });
  for (const tagId of tagIds) {
    await prisma.budgetTag.create({ data: { budgetId, tagId } });
  }
}
