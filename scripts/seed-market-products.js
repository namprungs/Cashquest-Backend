/**
 * Seed Market Products (FIXED VERSION - same logic as seed.ts)
 */

const { ProductType, RiskLevel } = require('@prisma/client');

async function seedMarketProducts(prisma, academicData) {
  console.log('📈 กำลังสร้างข้อมูล market สำหรับเทอมหลักเดียวกัน...');

  const { term, demoStudentProfile } = academicData;

  // Update wallet balance
  await prisma.wallet.update({
    where: { studentProfileId: demoStudentProfile.id },
    data: { balance: 250000 },
  });

  const productSeeds = [
    // === LOW RISK ===
    {
      type: ProductType.STOCK,
      symbol: 'SCHMART',
      name: 'SchoolMart',
      description:
        'ร้านสหกรณ์ภายในโรงเรียน รายได้สม่ำเสมอ ไม่ขึ้นกับเทรนด์ ความเสี่ยงต่ำ',
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
      description:
        'โรงพยาบาลเอกชนขนาดกลาง รายได้ไม่ขึ้นกับวัฏจักรเศรษฐกิจ ความต้องการรักษาพยาบาลคงที่ทุกสภาวะ',
      riskLevel: RiskLevel.LOW,
      sector: 'HEALTHCARE',
      isActive: true,
      isDividendEnabled: true,
      dividendYieldAnnual: 0.025,
      dividendPayoutIntervalWeeks: 4,
      simulation: { initialPrice: 95, mu: 0.04, sigma: 0.1, dt: 1 / 52 },
    },

    // === MEDIUM RISK ===
    {
      type: ProductType.STOCK,
      symbol: 'GRNPWR',
      name: 'GreenPower',
      description:
        'พลังงานทดแทน รายได้ค่อนข้างสม่ำเสมอ แต่ขึ้นกับนโยบายรัฐและราคาน้ำมัน',
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
      description:
        'บริษัทสินเชื่อและ digital banking รายได้ขึ้นกับดอกเบี้ยนโยบายและปริมาณสินเชื่อในระบบ',
      riskLevel: RiskLevel.MED,
      sector: 'FINANCIAL',
      isActive: true,
      isDividendEnabled: false,
      dividendPayoutIntervalWeeks: 4,
      simulation: { initialPrice: 75, mu: 0.075, sigma: 0.22, dt: 1 / 52 },
    },

    // === HIGH RISK ===
    {
      type: ProductType.STOCK,
      symbol: 'TWAV',
      name: 'TechWave',
      description: 'บริษัท tech เติบโตเร็ว ผันผวนตาม sentiment ตลาดและกระแส',
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
      description:
        'บริษัทเกมและ content ดิจิทัล เติบโตตาม trend แต่ผันผวนสูงตาม sentiment และ discretionary spending',
      riskLevel: RiskLevel.HIGH,
      sector: 'GAMING',
      isActive: true,
      isDividendEnabled: false,
      dividendPayoutIntervalWeeks: 4,
      simulation: { initialPrice: 60, mu: 0.14, sigma: 0.38, dt: 1 / 52 },
    },
    {
      type: ProductType.BOND,
      symbol: 'TGBOND',
      name: 'ThaiGovBond',
      description:
        'พันธบัตรรัฐบาลไทย อัตราดอกเบี้ย 2.8% ต่อปี อายุ 10 สัปดาห์ จ่ายดอกทุก 2 วัน ผลตอบแทนรวม +98%',
      riskLevel: RiskLevel.LOW,
      sector: 'GOVERNMENT_BOND',
      isActive: true,
      isDividendEnabled: true,
      dividendPayoutIntervalWeeks: 1,
      metaJson: {
        tag: 'B1',
        maturityWeeks: 10,
        couponIntervalDays: 2,
        totalReturnRate: 0.98,
        weeklyPriceVolPct: 0.5,
        minPurchase: 10000,
      },
      simulation: {
        model: 'VASICEK',
        initialPrice: 10000,
        mu: 0,
        sigma: 0,
        dt: 1 / 52,
        faceValue: 10000,
        couponRate: 0.028,
        initialYield: 0.028,
        modifiedDuration: 9.17,
        kappa: 0.3,
        theta: 0.028,
        sigmaYield: 0.008,
      },
    },
  ];

  const products = [];

  for (const seed of productSeeds) {
    const { simulation, ...productData } = seed;

    // ✅ 1. upsert product (เหมือน seed.ts)
    const product = await prisma.product.upsert({
      where: { symbol: seed.symbol },
      update: {
        ...productData,
      },
      create: {
        symbol: seed.symbol,
        ...productData,
      },
      select: {
        id: true,
        symbol: true,
      },
    });

    const productId = product.id;

    // ✅ 2. upsert productSimulation (สำคัญสุด)
    await prisma.productSimulation.upsert({
      where: {
        termId_productId: {
          termId: term.id,
          productId: productId,
        },
      },
      update: {
        initialPrice: simulation.initialPrice,
        model: simulation.model ?? 'GBM',
        mu: simulation.mu ?? 0,
        sigma: simulation.sigma ?? 0,
        dt: simulation.dt,
        faceValue: simulation.faceValue,
        couponRate: simulation.couponRate,
        initialYield: simulation.initialYield,
        modifiedDuration: simulation.modifiedDuration,
        kappa: simulation.kappa,
        theta: simulation.theta,
        sigmaYield: simulation.sigmaYield,
        yieldFloor: simulation.yieldFloor ?? 0.001,
      },
      create: {
        termId: term.id,
        productId: productId,
        initialPrice: simulation.initialPrice,
        model: simulation.model ?? 'GBM',
        mu: simulation.mu ?? 0,
        sigma: simulation.sigma ?? 0,
        dt: simulation.dt,
        faceValue: simulation.faceValue,
        couponRate: simulation.couponRate,
        initialYield: simulation.initialYield,
        modifiedDuration: simulation.modifiedDuration,
        kappa: simulation.kappa,
        theta: simulation.theta,
        sigmaYield: simulation.sigmaYield,
        yieldFloor: simulation.yieldFloor ?? 0.001,
      },
    });

    products.push({
      id: productId,
      symbol: product.symbol,
      simulation,
    });
  }

  // Deactivate old bonds that are no longer in the seed
  const activeSymbols = productSeeds.map((s) => s.symbol);
  await prisma.product.updateMany({
    where: {
      type: ProductType.BOND,
      symbol: { notIn: activeSymbols },
      isActive: true,
    },
    data: { isActive: false },
  });

  console.log(`✅ ${products.length} products seeded`);
  return products;
}

module.exports = { seedMarketProducts };
