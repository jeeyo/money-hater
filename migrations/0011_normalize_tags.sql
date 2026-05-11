-- Phase 5 — schema-level normalization for tags. Until now Expense.tags and
-- Budget.tags were JSON-encoded TEXT, forcing post-query filtering in JS. We
-- now introduce per-user Tag rows plus ExpenseTag / BudgetTag join tables so
-- "spend matching tag X" queries can be answered with indexed joins.
--
-- The legacy JSON columns are retained as a denormalized cache for read paths
-- (the client still receives a string[]), and will be removed in a follow-up
-- migration once all writers maintain both sides.

CREATE TABLE IF NOT EXISTS "Tag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    CONSTRAINT "Tag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "Tag_userId_name_unique" ON "Tag"("userId", "name");
CREATE INDEX IF NOT EXISTS "Tag_userId_idx" ON "Tag"("userId");

CREATE TABLE IF NOT EXISTS "ExpenseTag" (
    "expenseId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    PRIMARY KEY ("expenseId", "tagId"),
    CONSTRAINT "ExpenseTag_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ExpenseTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ExpenseTag_tagId_idx" ON "ExpenseTag"("tagId");

CREATE TABLE IF NOT EXISTS "BudgetTag" (
    "budgetId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    PRIMARY KEY ("budgetId", "tagId"),
    CONSTRAINT "BudgetTag_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BudgetTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "BudgetTag_tagId_idx" ON "BudgetTag"("tagId");

-- Backfill from existing JSON columns. CASE-guard json_each so malformed or
-- empty payloads don't error the migration.

INSERT OR IGNORE INTO "Tag" ("id", "userId", "name")
SELECT lower(hex(randomblob(16))), e."userId", j.value
FROM "Expense" e, json_each(
    CASE
        WHEN e.tags IS NOT NULL AND json_valid(e.tags) AND json_type(e.tags) = 'array'
        THEN e.tags
        ELSE '[]'
    END
) j
WHERE typeof(j.value) = 'text' AND length(j.value) > 0;

INSERT OR IGNORE INTO "Tag" ("id", "userId", "name")
SELECT lower(hex(randomblob(16))), b."userId", j.value
FROM "Budget" b, json_each(
    CASE
        WHEN b.tags IS NOT NULL AND json_valid(b.tags) AND json_type(b.tags) = 'array'
        THEN b.tags
        ELSE '[]'
    END
) j
WHERE typeof(j.value) = 'text' AND length(j.value) > 0;

INSERT OR IGNORE INTO "ExpenseTag" ("expenseId", "tagId")
SELECT e.id, t.id
FROM "Expense" e, json_each(
    CASE
        WHEN e.tags IS NOT NULL AND json_valid(e.tags) AND json_type(e.tags) = 'array'
        THEN e.tags
        ELSE '[]'
    END
) j
JOIN "Tag" t ON t."userId" = e."userId" AND t."name" = j.value
WHERE typeof(j.value) = 'text' AND length(j.value) > 0;

INSERT OR IGNORE INTO "BudgetTag" ("budgetId", "tagId")
SELECT b.id, t.id
FROM "Budget" b, json_each(
    CASE
        WHEN b.tags IS NOT NULL AND json_valid(b.tags) AND json_type(b.tags) = 'array'
        THEN b.tags
        ELSE '[]'
    END
) j
JOIN "Tag" t ON t."userId" = b."userId" AND t."name" = j.value
WHERE typeof(j.value) = 'text' AND length(j.value) > 0;
