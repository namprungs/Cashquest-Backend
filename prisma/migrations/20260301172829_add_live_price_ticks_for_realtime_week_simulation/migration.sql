-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PriceGenerationType" ADD VALUE 'LIVE_TICK';
ALTER TYPE "PriceGenerationType" ADD VALUE 'LIVE_FINALIZED';

-- CreateTable
CREATE TABLE "product_live_price_ticks" (
    "id" UUID NOT NULL,
    "termId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "simulated_week_no" INTEGER NOT NULL,
    "ticked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "price" DECIMAL(18,6) NOT NULL,
    "return_pct" DECIMAL(10,6) NOT NULL,
    "mu_used" DECIMAL(10,6),
    "sigma_used" DECIMAL(10,6),
    "event_id" UUID,
    "generation_type" "PriceGenerationType" NOT NULL,

    CONSTRAINT "product_live_price_ticks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_live_price_ticks_termId_productId_simulated_week_no_idx" ON "product_live_price_ticks"("termId", "productId", "simulated_week_no", "ticked_at");

-- CreateIndex
CREATE INDEX "product_live_price_ticks_termId_simulated_week_no_ticked_at_idx" ON "product_live_price_ticks"("termId", "simulated_week_no", "ticked_at");

-- CreateIndex
CREATE INDEX "product_live_price_ticks_event_id_idx" ON "product_live_price_ticks"("event_id");

-- AddForeignKey
ALTER TABLE "product_live_price_ticks" ADD CONSTRAINT "product_live_price_ticks_termId_fkey" FOREIGN KEY ("termId") REFERENCES "terms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_live_price_ticks" ADD CONSTRAINT "product_live_price_ticks_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_live_price_ticks" ADD CONSTRAINT "product_live_price_ticks_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "economic_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
