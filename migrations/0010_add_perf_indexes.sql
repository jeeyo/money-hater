-- Indexes that accelerate budget computation and per-account expense queries.
CREATE INDEX IF NOT EXISTS "Expense_userId_category_idx" ON "Expense"("userId", "category");
CREATE INDEX IF NOT EXISTS "Expense_userId_accountId_date_idx" ON "Expense"("userId", "accountId", "date");
CREATE INDEX IF NOT EXISTS "Budget_userId_startDate_endDate_idx" ON "Budget"("userId", "startDate", "endDate");
