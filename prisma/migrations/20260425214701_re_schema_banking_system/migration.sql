-- CreateEnum
CREATE TYPE "BankType" AS ENUM ('SAVINGS_ACCOUNT', 'FIXED_DEPOSIT');

-- AlterTable
ALTER TABLE "banks" ADD COLUMN     "maxWeeks" INTEGER,
ADD COLUMN     "minWeeks" INTEGER,
ADD COLUMN     "type" "BankType" NOT NULL DEFAULT 'SAVINGS_ACCOUNT',
ALTER COLUMN "withdrawLimitPerTerm" SET DEFAULT 2000;

-- AlterTable
ALTER TABLE "savings_accounts" ADD COLUMN     "interestAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "rateUsed" DECIMAL(5,4),
ADD COLUMN     "weekNo" INTEGER;
