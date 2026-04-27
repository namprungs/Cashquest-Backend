/*
  Warnings:

  - A unique constraint covering the columns `[studentProfileId,expenseEventId,weekNo,day_of_week]` on the table `student_expenses` will be added. If there are existing duplicate values, this will fail.
*/

-- DropIndex
DROP INDEX "student_expenses_studentProfileId_expenseEventId_weekNo_key";

-- AlterTable: add day_of_week column with temporary default for existing rows
ALTER TABLE "student_expenses" ADD COLUMN "day_of_week" INTEGER NOT NULL DEFAULT 1;

-- Backfill: derive day-of-week from created_at (ISOWEEK: 1=Mon..7=Sun, capped to 5=Fri)
UPDATE "student_expenses"
SET "day_of_week" = LEAST(EXTRACT(ISODOW FROM "created_at")::INTEGER, 5);

-- Remove the temporary default so future inserts must provide the value explicitly
ALTER TABLE "student_expenses" ALTER COLUMN "day_of_week" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "student_expenses_termId_weekNo_day_of_week_idx" ON "student_expenses"("termId", "weekNo", "day_of_week");

-- CreateIndex
CREATE UNIQUE INDEX "student_expenses_studentProfileId_expenseEventId_weekNo_day_key" ON "student_expenses"("studentProfileId", "expenseEventId", "weekNo", "day_of_week");
