/**
 * Seed Market Products
 */

const { ProductType, RiskLevel } = require('@prisma/client');

async function seedMarketProducts(prisma, academicData) {
  console.log('📈 กำลังสร้างข้อมูล market สำหรับเทอมหลักเดียวกัน...');

  const { term, demoStudentProfile } = academicData;

  // Update wallet balance for market activity
  await prisma.wallet.update({
    where: { studentProfileId: demoStudentProfile.id },
    data: { balance: 250000 },
  });

  const productSeeds = [
    // === LOW RISK (L1, L2) ===
    {
      type: ProductType.STOCK,
      symbol: 'SCHMART',
      name: 'SchoolMart',
      riskLevel: RiskLevel.LOW,
      sector: 'CONSUMER',
      isActive: true,
      isDividendEnabled: true,
      dividendYieldAnnual: 0.03,
      dividendPayoutIntervalWeeks: 4,
      simulation: { initialPrice: 85, mu: 0.035, sigma: 0.09, dt: 1 / 52 },
    },
    {
      type: ProductType.STOCK,
      symbol: 'HLTHPLS',
      name: 'HealthPlus',
      riskLevel: RiskLevel.LOW,
      sector: 'HEALTHCARE',
      isActive: true,
      isDividendEnabled: true,
      dividendYieldAnnual: 0.025,
      dividendPayoutIntervalWeeks: 4,
      simulation: { initialPrice: 95, mu: 0.04, sigma: 0.1, dt: 1 / 52 },
    },
    // === MEDIUM RISK (M1, M2) ===
    {
      type: ProductType.STOCK,
      symbol: 'GRNPWR',
      name: 'GreenPower',
      riskLevel: RiskLevel.MED,
      sector: 'ENERGY',
      isActive: true,
      isDividendEnabled: true,
      dividendYieldAnnual: 0.04,
      dividendPayoutIntervalWeeks: 4,
      simulation: { initialPrice: 110, mu: 0.07, sigma: 0.18, dt: 1 / 52 },
    },
    {
      type: ProductType.STOCK,
      symbol: 'FSTFIN',
      name: 'FastFinance',
      riskLevel: RiskLevel.MED,
      sector: 'FINANCIAL',
      isActive: true,
      isDividendEnabled: false,
      dividendPayoutIntervalWeeks: 4,
      simulation: { initialPrice: 75, mu: 0.075, sigma: 0.22, dt: 1 / 52 },
    },
    // === HIGH RISK (H1, H2) ===
    {
      type: ProductType.STOCK,
      symbol: 'TWAV',
      name: 'TechWave',
      riskLevel: RiskLevel.HIGH,
      sector: 'TECH',
      isActive: true,
      isDividendEnabled: false,
      dividendPayoutIntervalWeeks: 4,
      simulation: { initialPrice: 130, mu: 0.12, sigma: 0.3, dt: 1 / 52 },
    },
    {
      type: ProductType.STOCK,
      symbol: 'GHUB',
      name: 'GameHub',
      riskLevel: RiskLevel.HIGH,
      sector: 'GAMING',
      isActive: true,
      isDividendEnabled: false,
      dividendPayoutIntervalWeeks: 4,
      simulation: { initialPrice: 60, mu: 0.14, sigma: 0.38, dt: 1 / 52 },
    },
  ];

  const products = [];

  for (const seed of productSeeds) {
    const { simulation, ...productData } = seed;

    const existing = await prisma.product.findFirst({
      where: { symbol: seed.symbol },
      select: { id: true },
    });

    let productId;
    if (existing) {
      const updated = await prisma.product.update({
        where: { id: existing.id },
        data: productData,
      });
      productId = updated.id;
    } else {
      const created = await prisma.product.create({
        data: productData,
      });
      productId = created.id;
    }

    products.push({
      id: productId,
      symbol: seed.symbol,
      simulation,
    });
  }

  console.log(`✅ ${products.length} products seeded`);
  return products;
}

module.exports = { seedMarketProducts };
