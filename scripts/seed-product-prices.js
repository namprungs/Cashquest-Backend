/**
 * Seed Term Simulation and Product Prices (OHLC)
 */

const { PriceGenerationType } = require('@prisma/client');

const addDays = (date, days) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

async function seedTermSimulation(prisma, academicData) {
  const { term, totalWeeks } = academicData;

  const currentMarketWeek = Math.min(6, totalWeeks);

  await prisma.termSimulation.upsert({
    where: { termId: term.id },
    update: {
      randomSeed: 20260301,
      currentWeek: currentMarketWeek,
      engineVersion: 'market-seed-v1',
    },
    create: {
      termId: term.id,
      randomSeed: 20260301,
      currentWeek: currentMarketWeek,
      engineVersion: 'market-seed-v1',
    },
  });

  console.log('✅ Term simulation seeded');
}

async function seedProductPrices(prisma, academicData, products) {
  const { term, totalWeeks } = academicData;

  const createSeededRng = (seed) => {
    let state = seed >>> 0;
    return () => {
      state = (1664525 * state + 1013904223) >>> 0;
      return state / 0xffffffff;
    };
  };

  const gaussianFromRng = (rng) => {
    let u = 0;
    let v = 0;
    while (u === 0) u = rng();
    while (v === 0) v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };

  const marketTotalPoints = Math.max(totalWeeks, 12);

  const marketRegimes = await prisma.marketRegime.findMany({
    where: { termId: term.id },
  });

  const marketEvents = await prisma.termEvent.findMany({
    where: { termId: term.id },
    include: { event: true },
  });

  // Delete old prices
  await prisma.productPrice.deleteMany({
    where: {
      termId: term.id,
      productId: { in: products.map((p) => p.id) },
    },
  });

  for (const product of products) {
    const rng = createSeededRng(20260301 + product.symbol.length * 97);
    let previousClose = product.simulation.initialPrice;

    const rows = [];

    for (let point = 1; point <= marketTotalPoints; point++) {
      const activeRegime = marketRegimes.find(
        (regime) => regime.startWeek <= point && regime.endWeek >= point,
      );

      const activeEvent = marketEvents.find(
        (event) => event.startWeek <= point && event.endWeek >= point,
      );

      const eventImpact =
        activeEvent?.customImpact ?? activeEvent?.event?.defaultImpact ?? null;

      const regimeMuAdj = activeRegime ? Number(activeRegime.muAdjustment) : 0;
      const regimeSigmaAdj = activeRegime ? Number(activeRegime.sigmaAdjustment) : 0;
      const eventMuAdj = eventImpact?.muAdjustment ? Number(eventImpact.muAdjustment) : 0;
      const eventSigmaAdj = eventImpact?.sigmaAdjustment ? Number(eventImpact.sigmaAdjustment) : 0;
      const sigmaMultiplier = eventImpact?.sigmaMultiplier ? Number(eventImpact.sigmaMultiplier) : 1;

      const mu = product.simulation.mu + regimeMuAdj + eventMuAdj;
      const sigma = Math.max(
        0.005,
        (product.simulation.sigma + regimeSigmaAdj + eventSigmaAdj) * sigmaMultiplier,
      );

      const z = gaussianFromRng(rng);
      const dt = product.simulation.dt;
      const drift = (mu - 0.5 * sigma * sigma) * dt;
      const diffusion = sigma * Math.sqrt(dt) * z;

      const open = previousClose;
      const close = Math.max(0.01, open * Math.exp(drift + diffusion));

      const wickNoise = Math.abs(gaussianFromRng(rng)) * 0.012;
      const high = Math.max(open, close) * (1 + wickNoise);
      const low = Math.max(0.01, Math.min(open, close) * (1 - wickNoise));

      rows.push({
        termId: term.id,
        productId: product.id,
        weekNo: point,
        open,
        high,
        low,
        close,
        returnPct: open === 0 ? 0 : (close - open) / open,
        muUsed: mu,
        sigmaUsed: sigma,
        eventId: activeEvent?.eventId ?? null,
        generationType: activeEvent
          ? PriceGenerationType.GBM_EVENT_ADJUSTED
          : PriceGenerationType.GBM,
        createdAt: addDays(term.startDate, point - 1),
      });

      previousClose = close;
    }

    if (rows.length > 0) {
      await prisma.productPrice.createMany({ data: rows });
    }
  }

  console.log(
    `✅ Product prices seeded for ${products.length} products, ${marketTotalPoints} weeks`,
  );
}

module.exports = { seedTermSimulation, seedProductPrices };
