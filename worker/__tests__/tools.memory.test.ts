import { describe, expect, it, vi } from 'vitest';
import { recallSpendingTool } from '../tools/memory';
import type { ToolContext } from '../agent';

type Result = { groupBy: string; rows: Array<{ key: string; total: number; count: number }> };

function makeCtx(prisma: unknown): ToolContext {
  return { userId: 'user-1', prisma: prisma as never, env: {} };
}

describe('recall_spending input schema', () => {
  it('defaults limit to 10', () => {
    const r = recallSpendingTool.inputSchema.safeParse({ groupBy: 'category' });
    expect(r.success).toBe(true);
    if (r.success) expect((r.data as { limit: number }).limit).toBe(10);
  });

  it('rejects a limit above 20', () => {
    expect(
      recallSpendingTool.inputSchema.safeParse({ groupBy: 'category', limit: 50 }).success,
    ).toBe(false);
  });

  it('rejects an unknown groupBy', () => {
    expect(recallSpendingTool.inputSchema.safeParse({ groupBy: 'bogus' }).success).toBe(false);
  });

  it('rejects an invalid date', () => {
    expect(
      recallSpendingTool.inputSchema.safeParse({ groupBy: 'tags', from: 'not-a-date' }).success,
    ).toBe(false);
  });
});

describe('recall_spending execute', () => {
  it('always scopes the query to the authenticated userId', async () => {
    const groupBy = vi.fn().mockResolvedValue([]);
    const ctx = makeCtx({ expense: { groupBy } });
    // Even if the model smuggles a userId, it must be ignored.
    await recallSpendingTool.execute({ groupBy: 'category', limit: 10, userId: 'attacker' }, ctx);
    expect(groupBy).toHaveBeenCalledOnce();
    const where = groupBy.mock.calls[0][0].where;
    expect(where.userId).toBe('user-1');
    expect(where.type).toBe('expense');
  });

  it('aggregates categories sorted by amount', async () => {
    const groupBy = vi.fn().mockResolvedValue([
      { category: 'Food & Dining', _sum: { amount: 30 }, _count: { _all: 3 } },
      { category: 'Travel', _sum: { amount: 100 }, _count: { _all: 1 } },
    ]);
    const ctx = makeCtx({ expense: { groupBy } });
    const res = (await recallSpendingTool.execute(
      { groupBy: 'category', limit: 10 },
      ctx,
    )) as Result;
    expect(res.groupBy).toBe('category');
    expect(res.rows[0]).toMatchObject({ key: 'Travel', total: 100, count: 1 });
    expect(res.rows[1]).toMatchObject({ key: 'Food & Dining', total: 30, count: 3 });
  });

  it('applies category and date filters', async () => {
    const groupBy = vi.fn().mockResolvedValue([]);
    const ctx = makeCtx({ expense: { groupBy } });
    await recallSpendingTool.execute(
      {
        groupBy: 'placeName',
        limit: 5,
        category: 'Food & Dining',
        from: '2026-01-01',
        to: '2026-02-01',
      },
      ctx,
    );
    const where = groupBy.mock.calls[0][0].where;
    expect(where.category).toBe('Food & Dining');
    expect(where.date.gte).toBeInstanceOf(Date);
    expect(where.date.lte).toBeInstanceOf(Date);
  });

  it('aggregates tags from the legacy JSON cache', async () => {
    const findMany = vi.fn().mockResolvedValue([
      { tags: JSON.stringify(['coffee', 'work']), amount: 5 },
      { tags: JSON.stringify(['coffee']), amount: 3 },
      { tags: 'not json', amount: 9 },
    ]);
    const ctx = makeCtx({ expense: { findMany } });
    const res = (await recallSpendingTool.execute({ groupBy: 'tags', limit: 10 }, ctx)) as Result;
    const coffee = res.rows.find((r) => r.key === 'coffee');
    const work = res.rows.find((r) => r.key === 'work');
    expect(coffee).toMatchObject({ key: 'coffee', total: 8, count: 2 });
    expect(work).toMatchObject({ key: 'work', total: 5, count: 1 });
    const where = findMany.mock.calls[0][0].where;
    expect(where.userId).toBe('user-1');
  });
});
