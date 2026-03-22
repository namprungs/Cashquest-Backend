/*
  Warnings:

  - Added the required column `lifeExpectancy` to the `retirement_goals` table without a default value. This is not possible if the table is not empty.
  - Added the required column `monthlyExpense` to the `retirement_goals` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "retirement_goals" ADD COLUMN     "lifeExpectancy" INTEGER NOT NULL,
ADD COLUMN     "monthlyExpense" DECIMAL(12,2) NOT NULL,
ADD COLUMN     "retirementAge" INTEGER NOT NULL DEFAULT 60,
ALTER COLUMN "targetDate" DROP NOT NULL;
