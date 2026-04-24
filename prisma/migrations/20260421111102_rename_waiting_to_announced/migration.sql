/*
  Warnings:

  - The values [WAITING] on the enum `TermEventStatus` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "TermEventStatus_new" AS ENUM ('SCHEDULED', 'ANNOUNCED', 'ACTIVE', 'EXPIRED');
ALTER TABLE "public"."term_events" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "term_events" ALTER COLUMN "status" TYPE "TermEventStatus_new" USING ("status"::text::"TermEventStatus_new");
ALTER TYPE "TermEventStatus" RENAME TO "TermEventStatus_old";
ALTER TYPE "TermEventStatus_new" RENAME TO "TermEventStatus";
DROP TYPE "public"."TermEventStatus_old";
ALTER TABLE "term_events" ALTER COLUMN "status" SET DEFAULT 'SCHEDULED';
COMMIT;
