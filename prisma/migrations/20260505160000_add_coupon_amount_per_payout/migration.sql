-- Add couponAmountPerPayout column
ALTER TABLE "bond_positions" ADD COLUMN "coupon_amount_per_payout" NUMERIC(18,6) NOT NULL DEFAULT 0;

-- Backfill: compute per-payout amount from existing data
-- Formula: faceValue * couponRate * (couponIntervalDays / 365) * units
UPDATE "bond_positions"
SET "coupon_amount_per_payout" =
  "face_value" * "coupon_rate" * ("coupon_interval_days"::numeric / 365) * "units";
