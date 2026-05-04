-- AlterTable: add updated_at column
ALTER TABLE "bond_positions" ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT NOW();

-- Backfill: set updated_at = created_at for existing rows
UPDATE "bond_positions" SET "updated_at" = "created_at";

-- Remove the default (Prisma manages it via @updatedAt)
ALTER TABLE "bond_positions" ALTER COLUMN "updated_at" DROP DEFAULT;
