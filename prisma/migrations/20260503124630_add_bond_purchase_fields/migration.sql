-- AlterTable
ALTER TABLE "bond_positions" ADD COLUMN "purchase_price"  DECIMAL(18,6) NOT NULL DEFAULT 0,
ADD COLUMN "purchase_amount" DECIMAL(18,6) NOT NULL DEFAULT 0;

-- Backfill: use faceValue as purchase price proxy and calculate amount
UPDATE "bond_positions"
SET "purchase_price"  = "face_value",
    "purchase_amount" = "units" * "face_value"
WHERE "purchase_price" = 0;

-- Remove default after backfill
ALTER TABLE "bond_positions" ALTER COLUMN "purchase_price" DROP DEFAULT;
ALTER TABLE "bond_positions" ALTER COLUMN "purchase_amount" DROP DEFAULT;
