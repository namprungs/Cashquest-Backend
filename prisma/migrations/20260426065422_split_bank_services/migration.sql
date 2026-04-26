/*
  Warnings:

  - You are about to drop the column `feePerTransaction` on the `banks` table. All the data in the column will be lost.
  - You are about to drop the column `interestRate` on the `banks` table. All the data in the column will be lost.
  - You are about to drop the column `maxWeeks` on the `banks` table. All the data in the column will be lost.
  - You are about to drop the column `minWeeks` on the `banks` table. All the data in the column will be lost.
  - You are about to drop the column `type` on the `banks` table. All the data in the column will be lost.
  - You are about to drop the column `withdrawLimitPerTerm` on the `banks` table. All the data in the column will be lost.
  - You are about to drop the column `bankId` on the `fixed_deposits` table. All the data in the column will be lost.
  - You are about to drop the column `bankId` on the `savings_accounts` table. All the data in the column will be lost.
  - You are about to drop the column `rateUsed` on the `savings_accounts` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[studentProfileId,savingsAccountBankId]` on the table `savings_accounts` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `fixedDepositBankId` to the `fixed_deposits` table without a default value. This is not possible if the table is not empty.
  - Added the required column `savingsAccountBankId` to the `savings_accounts` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "fixed_deposits" DROP CONSTRAINT "fixed_deposits_bankId_fkey";

-- DropForeignKey
ALTER TABLE "savings_accounts" DROP CONSTRAINT "savings_accounts_bankId_fkey";

-- DropIndex
DROP INDEX "savings_accounts_studentProfileId_bankId_key";

-- AlterTable
ALTER TABLE "banks" DROP COLUMN "feePerTransaction",
DROP COLUMN "interestRate",
DROP COLUMN "maxWeeks",
DROP COLUMN "minWeeks",
DROP COLUMN "type",
DROP COLUMN "withdrawLimitPerTerm";

-- AlterTable
ALTER TABLE "fixed_deposits" DROP COLUMN "bankId",
ADD COLUMN     "fixedDepositBankId" UUID NOT NULL;

-- AlterTable
ALTER TABLE "savings_accounts" DROP COLUMN "bankId",
DROP COLUMN "rateUsed",
ADD COLUMN     "savingsAccountBankId" UUID NOT NULL;

-- DropEnum
DROP TYPE "BankType";

-- CreateTable
CREATE TABLE "savings_account_banks" (
    "id" UUID NOT NULL,
    "bankId" UUID NOT NULL,
    "interestRate" DECIMAL(5,4) NOT NULL,
    "withdrawLimitPerTerm" INTEGER NOT NULL DEFAULT 2000,
    "feePerTransaction" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "savings_account_banks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fixed_deposit_banks" (
    "id" UUID NOT NULL,
    "bankId" UUID NOT NULL,
    "interestRate" DECIMAL(5,4) NOT NULL,
    "fixedDepositWeeks" INTEGER NOT NULL,
    "principal" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fixed_deposit_banks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "savings_accounts_studentProfileId_savingsAccountBankId_key" ON "savings_accounts"("studentProfileId", "savingsAccountBankId");

-- AddForeignKey
ALTER TABLE "savings_account_banks" ADD CONSTRAINT "savings_account_banks_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "banks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixed_deposit_banks" ADD CONSTRAINT "fixed_deposit_banks_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "banks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "savings_accounts" ADD CONSTRAINT "savings_accounts_savingsAccountBankId_fkey" FOREIGN KEY ("savingsAccountBankId") REFERENCES "savings_account_banks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixed_deposits" ADD CONSTRAINT "fixed_deposits_fixedDepositBankId_fkey" FOREIGN KEY ("fixedDepositBankId") REFERENCES "fixed_deposit_banks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
