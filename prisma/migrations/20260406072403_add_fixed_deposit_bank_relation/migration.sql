/*
  Warnings:

  - Added the required column `bankId` to the `fixed_deposits` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "fixed_deposits" ADD COLUMN     "bankId" UUID NOT NULL;

-- CreateTable
CREATE TABLE "fixed_deposit_transactions" (
    "id" UUID NOT NULL,
    "fixedDepositId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "principal" DECIMAL(12,2) NOT NULL,
    "interestAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "amountPaid" DECIMAL(12,2) NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fixed_deposit_transactions_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "fixed_deposits" ADD CONSTRAINT "fixed_deposits_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "banks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixed_deposit_transactions" ADD CONSTRAINT "fixed_deposit_transactions_fixedDepositId_fkey" FOREIGN KEY ("fixedDepositId") REFERENCES "fixed_deposits"("id") ON DELETE CASCADE ON UPDATE CASCADE;
