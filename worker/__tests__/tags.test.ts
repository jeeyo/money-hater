import { describe, expect, it, vi } from 'vitest';
import { upsertTagIds, syncExpenseTags, syncBudgetTags } from '../tags';

type AnyArgs = Record<string, unknown>;

function makePrismaStub(opts?: { existingTags?: Record<string, string> }) {
  const tagStore = new Map<string, string>(Object.entries(opts?.existingTags ?? {}));
  const calls = {
    upsert: [] as AnyArgs[],
    deleteExpense: [] as AnyArgs[],
    createExpense: [] as AnyArgs[],
    deleteBudget: [] as AnyArgs[],
    createBudget: [] as AnyArgs[],
  };

  const prisma = {
    tag: {
      upsert: vi.fn(async (args: AnyArgs) => {
        calls.upsert.push(args);
        const where = args.where as { userId_name: { userId: string; name: string } };
        const create = args.create as { id: string; userId: string; name: string };
        const key = `${where.userId_name.userId}:${where.userId_name.name}`;
        if (!tagStore.has(key)) tagStore.set(key, create.id);
        return { id: tagStore.get(key) };
      }),
    },
    expenseTag: {
      deleteMany: vi.fn(async (args: AnyArgs) => {
        calls.deleteExpense.push(args);
        return { count: 0 };
      }),
      create: vi.fn(async (args: AnyArgs) => {
        calls.createExpense.push(args);
        return args.data;
      }),
    },
    budgetTag: {
      deleteMany: vi.fn(async (args: AnyArgs) => {
        calls.deleteBudget.push(args);
        return { count: 0 };
      }),
      create: vi.fn(async (args: AnyArgs) => {
        calls.createBudget.push(args);
        return args.data;
      }),
    },
  };

  return { prisma, calls, tagStore };
}

describe('upsertTagIds', () => {
  it('returns empty when names is null/empty', async () => {
    const { prisma } = makePrismaStub();
    expect(await upsertTagIds(prisma as never, 'u1', null)).toEqual([]);
    expect(await upsertTagIds(prisma as never, 'u1', [])).toEqual([]);
    expect(await upsertTagIds(prisma as never, 'u1', ['', '   '])).toEqual([]);
  });

  it('dedupes and trims names before upsert', async () => {
    const { prisma, calls } = makePrismaStub();
    const ids = await upsertTagIds(prisma as never, 'u1', ['food', '  food  ', 'fun']);
    expect(ids).toHaveLength(2);
    expect(calls.upsert).toHaveLength(2);
    expect((calls.upsert[0].where as AnyArgs).userId_name).toMatchObject({
      userId: 'u1',
      name: 'food',
    });
  });

  it('reuses existing tag ids for the same user/name', async () => {
    const { prisma } = makePrismaStub({ existingTags: { 'u1:food': 'tag-food' } });
    const [id] = await upsertTagIds(prisma as never, 'u1', ['food']);
    expect(id).toBe('tag-food');
  });
});

describe('syncExpenseTags', () => {
  it('clears prior links then inserts one row per tag', async () => {
    const { prisma, calls } = makePrismaStub();
    await syncExpenseTags(prisma as never, 'u1', 'exp1', ['food', 'fun']);
    expect(calls.deleteExpense).toEqual([{ where: { expenseId: 'exp1' } }]);
    expect(calls.createExpense).toHaveLength(2);
    for (const call of calls.createExpense) {
      expect((call.data as AnyArgs).expenseId).toBe('exp1');
    }
  });

  it('clears links and inserts nothing when names is empty', async () => {
    const { prisma, calls } = makePrismaStub();
    await syncExpenseTags(prisma as never, 'u1', 'exp1', []);
    expect(calls.deleteExpense).toEqual([{ where: { expenseId: 'exp1' } }]);
    expect(calls.createExpense).toHaveLength(0);
  });
});

describe('syncBudgetTags', () => {
  it('clears prior links then inserts one row per tag', async () => {
    const { prisma, calls } = makePrismaStub();
    await syncBudgetTags(prisma as never, 'u2', 'b1', ['groceries']);
    expect(calls.deleteBudget).toEqual([{ where: { budgetId: 'b1' } }]);
    expect(calls.createBudget).toHaveLength(1);
    expect((calls.createBudget[0].data as AnyArgs).budgetId).toBe('b1');
  });
});
