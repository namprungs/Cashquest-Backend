CREATE TYPE "TermEventApplyMode" AS ENUM ('NEXT_TICK', 'IMMEDIATE');

ALTER TABLE "term_events"
ADD COLUMN "apply_mode" "TermEventApplyMode" NOT NULL DEFAULT 'NEXT_TICK';
