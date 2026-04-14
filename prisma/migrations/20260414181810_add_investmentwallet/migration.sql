-- CreateEnum
CREATE TYPE "InvestmentTransactionType" AS ENUM ('STOCK_BUY', 'STOCK_SELL', 'TRANSFER_IN', 'TRANSFER_OUT');

-- CreateTable
CREATE TABLE "investment_wallets" (
    "id" UUID NOT NULL,
    "studentProfileId" UUID NOT NULL,
    "termId" UUID NOT NULL,
    "balance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "investment_wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investment_transactions" (
    "id" UUID NOT NULL,
    "investmentWalletId" UUID NOT NULL,
    "type" "InvestmentTransactionType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "balanceBefore" DECIMAL(12,2) NOT NULL,
    "balanceAfter" DECIMAL(12,2) NOT NULL,
    "metadata" JSONB,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "investment_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "investment_wallets_studentProfileId_key" ON "investment_wallets"("studentProfileId");

-- CreateIndex
CREATE INDEX "investment_wallets_termId_idx" ON "investment_wallets"("termId");

-- CreateIndex
CREATE INDEX "investment_transactions_investmentWalletId_createdAt_idx" ON "investment_transactions"("investmentWalletId", "createdAt");

-- AddForeignKey
ALTER TABLE "investment_wallets" ADD CONSTRAINT "investment_wallets_studentProfileId_fkey" FOREIGN KEY ("studentProfileId") REFERENCES "student_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investment_wallets" ADD CONSTRAINT "investment_wallets_termId_fkey" FOREIGN KEY ("termId") REFERENCES "terms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investment_transactions" ADD CONSTRAINT "investment_transactions_investmentWalletId_fkey" FOREIGN KEY ("investmentWalletId") REFERENCES "investment_wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
