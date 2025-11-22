-- DropTable
DROP TABLE IF EXISTS "Expense";
DROP TABLE IF EXISTS "User";

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "amount" REAL NOT NULL,
    "description" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "userId" TEXT NOT NULL,
    CONSTRAINT "Expense_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
