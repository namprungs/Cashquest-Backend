-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('STOCK', 'FUND', 'BOND');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('LOW', 'MED', 'HIGH');

-- CreateEnum
CREATE TYPE "PriceGenerationType" AS ENUM ('GBM', 'GBM_EVENT_ADJUSTED', 'MANUAL');

-- CreateEnum
CREATE TYPE "OrderSide" AS ENUM ('BUY', 'SELL');

-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('MARKET', 'LIMIT');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'EXECUTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BondPositionStatus" AS ENUM ('ACTIVE', 'MATURED', 'CLOSED');

-- CreateEnum
CREATE TYPE "EconomicEventType" AS ENUM ('VOLATILITY_SHOCK', 'DRIFT_SHIFT', 'MARKET_CRASH', 'SECTOR_SPECIFIC', 'REGIME_CHANGE');

-- CreateEnum
CREATE TYPE "TermEventStatus" AS ENUM ('SCHEDULED', 'ACTIVE', 'EXPIRED');

-- CreateEnum
CREATE TYPE "MarketRegimeName" AS ENUM ('BULL', 'BEAR', 'SIDEWAYS');

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "type" "ProductType" NOT NULL,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "risk_level" "RiskLevel" NOT NULL,
    "sector" TEXT,
    "meta_json" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_simulations" (
    "id" UUID NOT NULL,
    "termId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "initial_price" DECIMAL(18,6) NOT NULL,
    "mu" DECIMAL(10,6) NOT NULL,
    "sigma" DECIMAL(10,6) NOT NULL,
    "dt" DECIMAL(10,6) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_simulations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "term_simulations" (
    "id" UUID NOT NULL,
    "termId" UUID NOT NULL,
    "random_seed" INTEGER NOT NULL,
    "current_week" INTEGER NOT NULL DEFAULT 1,
    "engine_version" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "term_simulations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_prices" (
    "id" UUID NOT NULL,
    "termId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "week_no" INTEGER NOT NULL,
    "open" DECIMAL(18,6) NOT NULL,
    "high" DECIMAL(18,6) NOT NULL,
    "low" DECIMAL(18,6) NOT NULL,
    "close" DECIMAL(18,6) NOT NULL,
    "return_pct" DECIMAL(10,6) NOT NULL,
    "mu_used" DECIMAL(10,6),
    "sigma_used" DECIMAL(10,6),
    "event_id" UUID,
    "generation_type" "PriceGenerationType" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "student_profile_id" UUID NOT NULL,
    "termId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "side" "OrderSide" NOT NULL,
    "order_type" "OrderType" NOT NULL,
    "requested_price" DECIMAL(18,6),
    "executed_price" DECIMAL(18,6),
    "quantity" DECIMAL(18,6) NOT NULL,
    "fee" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "week_no" INTEGER NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "holdings" (
    "id" UUID NOT NULL,
    "student_profile_id" UUID NOT NULL,
    "termId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "units" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "avg_cost" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "holdings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dividend_payouts" (
    "id" UUID NOT NULL,
    "termId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "student_profile_id" UUID NOT NULL,
    "week_no" INTEGER NOT NULL,
    "units" DECIMAL(18,6) NOT NULL,
    "dividend_per_unit" DECIMAL(18,6) NOT NULL,
    "amount" DECIMAL(18,6) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dividend_payouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bond_positions" (
    "id" UUID NOT NULL,
    "termId" UUID NOT NULL,
    "holding_id" UUID NOT NULL,
    "face_value" DECIMAL(18,6) NOT NULL,
    "coupon_rate" DECIMAL(10,6) NOT NULL,
    "coupon_interval_weeks" INTEGER NOT NULL,
    "start_week_no" INTEGER NOT NULL,
    "maturity_week_no" INTEGER NOT NULL,
    "status" "BondPositionStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bond_positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bond_coupon_payouts" (
    "id" UUID NOT NULL,
    "bond_position_id" UUID NOT NULL,
    "week_no" INTEGER NOT NULL,
    "amount" DECIMAL(18,6) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bond_coupon_payouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "economic_events" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "event_type" "EconomicEventType" NOT NULL,
    "default_impact" JSONB NOT NULL,
    "is_repeatable" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "economic_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "term_events" (
    "id" UUID NOT NULL,
    "termId" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "start_week" INTEGER NOT NULL,
    "end_week" INTEGER NOT NULL,
    "custom_impact" JSONB,
    "status" "TermEventStatus" NOT NULL DEFAULT 'SCHEDULED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "term_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market_regimes" (
    "id" UUID NOT NULL,
    "termId" UUID NOT NULL,
    "name" "MarketRegimeName" NOT NULL,
    "mu_adjustment" DECIMAL(10,6) NOT NULL,
    "sigma_adjustment" DECIMAL(10,6) NOT NULL,
    "start_week" INTEGER NOT NULL,
    "end_week" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "market_regimes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "products_symbol_key" ON "products"("symbol");

-- CreateIndex
CREATE UNIQUE INDEX "product_simulations_termId_productId_key" ON "product_simulations"("termId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "term_simulations_termId_key" ON "term_simulations"("termId");

-- CreateIndex
CREATE INDEX "product_prices_event_id_idx" ON "product_prices"("event_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_prices_termId_productId_week_no_key" ON "product_prices"("termId", "productId", "week_no");

-- CreateIndex
CREATE INDEX "orders_student_profile_id_termId_week_no_idx" ON "orders"("student_profile_id", "termId", "week_no");

-- CreateIndex
CREATE INDEX "orders_termId_productId_idx" ON "orders"("termId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "holdings_student_profile_id_termId_productId_key" ON "holdings"("student_profile_id", "termId", "productId");

-- CreateIndex
CREATE INDEX "dividend_payouts_termId_productId_student_profile_id_week_n_idx" ON "dividend_payouts"("termId", "productId", "student_profile_id", "week_no");

-- CreateIndex
CREATE INDEX "bond_positions_termId_idx" ON "bond_positions"("termId");

-- CreateIndex
CREATE INDEX "bond_positions_holding_id_idx" ON "bond_positions"("holding_id");

-- CreateIndex
CREATE INDEX "bond_coupon_payouts_bond_position_id_week_no_idx" ON "bond_coupon_payouts"("bond_position_id", "week_no");

-- CreateIndex
CREATE INDEX "term_events_termId_start_week_end_week_idx" ON "term_events"("termId", "start_week", "end_week");

-- CreateIndex
CREATE INDEX "term_events_eventId_idx" ON "term_events"("eventId");

-- CreateIndex
CREATE INDEX "market_regimes_termId_start_week_end_week_idx" ON "market_regimes"("termId", "start_week", "end_week");

-- AddForeignKey
ALTER TABLE "product_simulations" ADD CONSTRAINT "product_simulations_termId_fkey" FOREIGN KEY ("termId") REFERENCES "terms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_simulations" ADD CONSTRAINT "product_simulations_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "term_simulations" ADD CONSTRAINT "term_simulations_termId_fkey" FOREIGN KEY ("termId") REFERENCES "terms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_prices" ADD CONSTRAINT "product_prices_termId_fkey" FOREIGN KEY ("termId") REFERENCES "terms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_prices" ADD CONSTRAINT "product_prices_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_prices" ADD CONSTRAINT "product_prices_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "economic_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_student_profile_id_fkey" FOREIGN KEY ("student_profile_id") REFERENCES "student_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_termId_fkey" FOREIGN KEY ("termId") REFERENCES "terms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holdings" ADD CONSTRAINT "holdings_student_profile_id_fkey" FOREIGN KEY ("student_profile_id") REFERENCES "student_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holdings" ADD CONSTRAINT "holdings_termId_fkey" FOREIGN KEY ("termId") REFERENCES "terms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holdings" ADD CONSTRAINT "holdings_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dividend_payouts" ADD CONSTRAINT "dividend_payouts_termId_fkey" FOREIGN KEY ("termId") REFERENCES "terms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dividend_payouts" ADD CONSTRAINT "dividend_payouts_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dividend_payouts" ADD CONSTRAINT "dividend_payouts_student_profile_id_fkey" FOREIGN KEY ("student_profile_id") REFERENCES "student_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bond_positions" ADD CONSTRAINT "bond_positions_termId_fkey" FOREIGN KEY ("termId") REFERENCES "terms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bond_positions" ADD CONSTRAINT "bond_positions_holding_id_fkey" FOREIGN KEY ("holding_id") REFERENCES "holdings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bond_coupon_payouts" ADD CONSTRAINT "bond_coupon_payouts_bond_position_id_fkey" FOREIGN KEY ("bond_position_id") REFERENCES "bond_positions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "term_events" ADD CONSTRAINT "term_events_termId_fkey" FOREIGN KEY ("termId") REFERENCES "terms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "term_events" ADD CONSTRAINT "term_events_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "economic_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_regimes" ADD CONSTRAINT "market_regimes_termId_fkey" FOREIGN KEY ("termId") REFERENCES "terms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
