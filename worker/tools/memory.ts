import { z } from 'zod';
import type { ToolContext, ToolDef } from '../agent';

// ---------------------------------------------------------------------------
// recall_spending — the agent's "memory".
//
// Aggregates the AUTHENTICATED user's own expenses on the fly (no dedicated
// memory tables). Lets the model answer "where do I usually go", "what do I
// spend on", and categorize new expenses consistently with history.
//
// Security: the query is ALWAYS scoped to ctx.userId (server-injected). The
// model cannot pass a userId — any such field is ignored.
// ---------------------------------------------------------------------------

const isoDate = z
  .string()
  .max(40)
  .refine((v) => !Number.isNaN(Date.parse(v)), 'invalid date');

const inputSchema = z.object({
  groupBy: z.enum(['category', 'tags', 'placeName', 'description']),
  from: isoDate.optional(),
  to: isoDate.optional(),
  category: z.string().max(60).optional(),
  query: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(20).default(10),
});

type Input = z.infer<typeof inputSchema>;

interface Row {
  key: string;
  total: number;
  count: number;
}

async function execute(args: unknown, ctx: ToolContext): Promise<unknown> {
  const { groupBy, from, to, category, query, limit } = args as Input;

  const where: {
    userId: string;
    type: string;
    category?: string;
    description?: { contains: string };
    date?: { gte?: Date; lte?: Date };
  } = { userId: ctx.userId, type: 'expense' };

  if (category) where.category = category;
  if (query) where.description = { contains: query };
  if (from || to) {
    where.date = {};
    if (from) where.date.gte = new Date(from);
    if (to) where.date.lte = new Date(to);
  }

  if (groupBy === 'tags') {
    const rows = await ctx.prisma.expense.findMany({ where, select: { tags: true, amount: true } });
    const map = new Map<string, Row>();
    for (const r of rows) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(r.tags);
      } catch {
        parsed = [];
      }
      const tags = Array.isArray(parsed)
        ? parsed.filter((t): t is string => typeof t === 'string')
        : [];
      for (const tag of tags) {
        const cur = map.get(tag) ?? { key: tag, total: 0, count: 0 };
        cur.total += r.amount;
        cur.count += 1;
        map.set(tag, cur);
      }
    }
    return { groupBy, rows: topRows([...map.values()], limit) };
  }

  // category | placeName | description: aggregate in the database.
  const grouped = await ctx.prisma.expense.groupBy({
    by: [groupBy as 'category'],
    where,
    _sum: { amount: true },
    _count: { _all: true },
  });

  const rows: Row[] = grouped
    .map((g) => ({
      key: (g as Record<string, unknown>)[groupBy] as string | null,
      total: g._sum.amount ?? 0,
      count: g._count._all,
    }))
    .filter((r): r is Row => r.key != null && r.key !== '')
    .map((r) => ({ key: r.key, total: r.total, count: r.count }));

  return { groupBy, rows: topRows(rows, limit) };
}

function topRows(rows: Row[], limit: number): Row[] {
  return rows
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total))
    .slice(0, limit)
    .map((r) => ({ key: r.key, total: Math.round(r.total * 100) / 100, count: r.count }));
}

export const recallSpendingTool: ToolDef = {
  name: 'recall_spending',
  description:
    "Look up the current user's own past spending, aggregated. Use it to recall the places they frequent, the activities/categories they spend on, or how they previously categorized a similar merchant. Returns rows of {key, total, count} sorted by amount.",
  parameters: {
    type: 'object',
    properties: {
      groupBy: {
        type: 'string',
        enum: ['category', 'tags', 'placeName', 'description'],
        description:
          'How to aggregate: by category, by tag, by saved place name, or by description.',
      },
      from: { type: 'string', description: 'Optional inclusive start date, ISO YYYY-MM-DD.' },
      to: { type: 'string', description: 'Optional inclusive end date, ISO YYYY-MM-DD.' },
      category: { type: 'string', description: 'Optional: restrict to a single category.' },
      query: {
        type: 'string',
        description: 'Optional case-insensitive substring to match against the description.',
      },
      limit: { type: 'number', description: 'Max rows to return (1-20, default 10).' },
    },
    required: ['groupBy'],
  },
  inputSchema,
  execute,
};
