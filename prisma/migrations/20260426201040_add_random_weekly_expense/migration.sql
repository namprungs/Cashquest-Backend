/*
  Warnings:

  - A unique constraint covering the columns `[bankId]` on the table `fixed_deposit_banks` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[bankId]` on the table `savings_account_banks` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "StudentExpenseStatus" AS ENUM ('UNPAID', 'PAID', 'PARTIAL');

-- CreateEnum
CREATE TYPE "ExpensePaymentSourceType" AS ENUM ('WALLET', 'SAVINGS', 'LIQUIDATION');

-- CreateTable
CREATE TABLE "expense_events" (
    "id" UUID NOT NULL,
    "termId" UUID NOT NULL,
    "lifeStageId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "baseAmount" DECIMAL(12,2) NOT NULL,
    "icon_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expense_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_expenses" (
    "id" UUID NOT NULL,
    "studentProfileId" UUID NOT NULL,
    "termId" UUID NOT NULL,
    "expenseEventId" UUID NOT NULL,
    "weekNo" INTEGER NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "remaining_amount" DECIMAL(12,2) NOT NULL,
    "status" "StudentExpenseStatus" NOT NULL DEFAULT 'UNPAID',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_payments" (
    "id" UUID NOT NULL,
    "studentExpenseId" UUID NOT NULL,
    "source_type" "ExpensePaymentSourceType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "source_ref" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expense_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "expense_events_termId_lifeStageId_idx" ON "expense_events"("termId", "lifeStageId");

-- CreateIndex
CREATE INDEX "student_expenses_studentProfileId_status_idx" ON "student_expenses"("studentProfileId", "status");

-- CreateIndex
CREATE INDEX "student_expenses_termId_weekNo_idx" ON "student_expenses"("termId", "weekNo");

-- CreateIndex
CREATE UNIQUE INDEX "student_expenses_studentProfileId_expenseEventId_weekNo_key" ON "student_expenses"("studentProfileId", "expenseEventId", "weekNo");

-- CreateIndex
CREATE INDEX "expense_payments_studentExpenseId_idx" ON "expense_payments"("studentExpenseId");

-- CreateIndex
CREATE UNIQUE INDEX "fixed_deposit_banks_bankId_key" ON "fixed_deposit_banks"("bankId");

-- CreateIndex
CREATE UNIQUE INDEX "savings_account_banks_bankId_key" ON "savings_account_banks"("bankId");

-- AddForeignKey
ALTER TABLE "expense_events" ADD CONSTRAINT "expense_events_termId_fkey" FOREIGN KEY ("termId") REFERENCES "terms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_events" ADD CONSTRAINT "expense_events_lifeStageId_fkey" FOREIGN KEY ("lifeStageId") REFERENCES "life_stages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_expenses" ADD CONSTRAINT "student_expenses_studentProfileId_fkey" FOREIGN KEY ("studentProfileId") REFERENCES "student_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_expenses" ADD CONSTRAINT "student_expenses_termId_fkey" FOREIGN KEY ("termId") REFERENCES "terms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_expenses" ADD CONSTRAINT "student_expenses_expenseEventId_fkey" FOREIGN KEY ("expenseEventId") REFERENCES "expense_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_payments" ADD CONSTRAINT "expense_payments_studentExpenseId_fkey" FOREIGN KEY ("studentExpenseId") REFERENCES "student_expenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
