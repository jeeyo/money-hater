-- Migration number: 0013 	 2026-05-28T00:00:00.000Z

ALTER TABLE Expense ADD COLUMN latitude REAL;
ALTER TABLE Expense ADD COLUMN longitude REAL;
ALTER TABLE Expense ADD COLUMN placeName TEXT;
ALTER TABLE Expense ADD COLUMN placeId TEXT;

CREATE INDEX IF NOT EXISTS "Expense_userId_placeName_idx" ON "Expense"("userId", "placeName");
