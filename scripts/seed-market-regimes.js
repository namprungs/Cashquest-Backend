/**
 * Seed Market Regimes
 */

const { MarketRegimeName } = require('@prisma/client');

async function seedMarketRegimes(prisma, academicData) {
  const { term, totalWeeks } = academicData;

  const marketTotalPoints = Math.max(totalWeeks, 12);

  await prisma.marketRegime.deleteMany({ where: { termId: term.id } });

  const split1 = Math.max(2, Math.floor(marketTotalPoints / 3));
  const split2 = Math.max(split1 + 1, Math.floor((marketTotalPoints * 2) / 3));

  await prisma.marketRegime.createMany({
    data: [
      {
        termId: term.id,
        name: MarketRegimeName.BULL,
        muAdjustment: 0.015,
        sigmaAdjustment: -0.01,
        startWeek: 1,
        endWeek: split1,
      },
      {
        termId: term.id,
        name: MarketRegimeName.BEAR,
        muAdjustment: -0.018,
        sigmaAdjustment: 0.025,
        startWeek: split1 + 1,
        endWeek: split2,
      },
      {
        termId: term.id,
        name: MarketRegimeName.SIDEWAYS,
        muAdjustment: 0.002,
        sigmaAdjustment: 0.005,
        startWeek: split2 + 1,
        endWeek: marketTotalPoints,
      },
    ],
  });

  console.log('✅ Market regimes seeded');
}

module.exports = { seedMarketRegimes };
