-- Add stock dividend configuration fields
ALTER TABLE "products"
  ADD COLUMN "is_dividend_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "dividend_yield_annual" DECIMAL(10, 6),
  ADD COLUMN "dividend_payout_interval_weeks" INTEGER NOT NULL DEFAULT 4,
  ADD COLUMN "fixed_dividend_per_unit" DECIMAL(18, 6);

-- Prevent duplicate dividend payout rows for same holder/product/week
CREATE UNIQUE INDEX "dividend_payouts_term_product_student_week_key"
ON "dividend_payouts"("term_id", "product_id", "student_profile_id", "week_no");
