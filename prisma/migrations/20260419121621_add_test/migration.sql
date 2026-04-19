-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "InvestmentTransactionType" ADD VALUE 'DIVIDEND';
ALTER TYPE "InvestmentTransactionType" ADD VALUE 'COUPON';

-- RenameIndex
ALTER INDEX "dividend_payouts_term_product_student_week_key" RENAME TO "dividend_payouts_termId_productId_student_profile_id_week_n_key";
