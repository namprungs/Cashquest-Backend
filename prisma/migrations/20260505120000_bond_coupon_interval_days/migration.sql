-- AlterTable: add new columns first
ALTER TABLE "bond_positions" ADD COLUMN "coupon_interval_days" INTEGER NOT NULL DEFAULT 28;
ALTER TABLE "bond_positions" ADD COLUMN "maturity_date" TIMESTAMP(3) NOT NULL DEFAULT NOW();

-- Migrate existing data: convert weeks to days
UPDATE "bond_positions" SET "coupon_interval_days" = "coupon_interval_weeks" * 7;

-- Migrate existing data: calculate maturity date from created_at + term weeks
UPDATE "bond_positions"
SET "maturity_date" = "created_at" + (("maturity_week_no" - "start_week_no") * 7) * INTERVAL '1 day';

-- Drop old column
ALTER TABLE "bond_positions" DROP COLUMN "coupon_interval_weeks";
