-- Support Vasicek bond simulations alongside the existing GBM stock engine.
ALTER TYPE "PriceGenerationType" ADD VALUE IF NOT EXISTS 'VASICEK';
ALTER TYPE "PriceGenerationType" ADD VALUE IF NOT EXISTS 'VASICEK_EVENT_ADJUSTED';

ALTER TABLE "product_simulations"
  ADD COLUMN "model" TEXT NOT NULL DEFAULT 'GBM',
  ADD COLUMN "face_value" DECIMAL(18,6),
  ADD COLUMN "coupon_rate" DECIMAL(10,6),
  ADD COLUMN "initial_yield" DECIMAL(10,6),
  ADD COLUMN "modified_duration" DECIMAL(10,6),
  ADD COLUMN "kappa" DECIMAL(10,6),
  ADD COLUMN "theta" DECIMAL(10,6),
  ADD COLUMN "sigma_yield" DECIMAL(10,6),
  ADD COLUMN "yield_floor" DECIMAL(10,6) NOT NULL DEFAULT 0.001;

ALTER TABLE "product_prices"
  ADD COLUMN "yield_open" DECIMAL(10,6),
  ADD COLUMN "yield_close" DECIMAL(10,6);

ALTER TABLE "product_live_price_ticks"
  ADD COLUMN "yield_value" DECIMAL(10,6);

ALTER TABLE "bond_positions"
  ADD COLUMN "units" DECIMAL(18,6) NOT NULL DEFAULT 1;
