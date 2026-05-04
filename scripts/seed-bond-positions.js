const { BondPositionStatus } = require('@prisma/client');

/**
 * Seed bond positions for the first student
 * Creates:
 * - ACTIVE bond (just purchased)
 * - MATURED bond (past maturity, with coupon payouts)
 */
async function seedBondPositions(prisma, academicData, products) {
  console.log('📋 กำลัง seed ตำแหน่งพันธบัตร...');

  const { term } = academicData;

  const bondProduct = products.find((p) => p.symbol === 'TGBOND');
  if (!bondProduct) {
    console.log('  ⚠️ TGBOND product not found, skipping bond seed');
    return;
  }

  const user = await prisma.user.findUnique({
    where: { email: 'student@school.com' },
  });
  if (!user) {
    console.log('  ⚠️ student@school.com not found, skipping bond seed');
    return;
  }

  const profile = await prisma.studentProfile.findUnique({
    where: { userId_termId: { userId: user.id, termId: term.id } },
    include: { investmentWallet: true },
  });
  if (!profile || !profile.investmentWallet) {
    console.log(
      '  ⚠️ Student profile or investment wallet not found, skipping',
    );
    return;
  }

  // Clean old bond data for this student
  const oldHoldings = await prisma.holding.findMany({
    where: {
      termId: term.id,
      studentProfileId: profile.id,
      productId: bondProduct.id,
    },
    select: { id: true },
  });

  for (const h of oldHoldings) {
    await prisma.bondCouponPayout.deleteMany({
      where: { bondPosition: { holdingId: h.id } },
    });
  }
  await prisma.bondPosition.deleteMany({
    where: {
      termId: term.id,
      holding: { studentProfileId: profile.id },
    },
  });
  await prisma.holding.deleteMany({
    where: {
      termId: term.id,
      studentProfileId: profile.id,
      productId: bondProduct.id,
    },
  });

  const walletId = profile.investmentWallet.id;
  const walletBalance = Number(profile.investmentWallet.balance);

  const faceValue = 10000;
  const couponRate = 0.028;
  const couponIntervalDays = 2;
  const maturityWeeks = 10;
  const now = new Date();

  // === 1. ACTIVE bond — just purchased today ===
  const bondHolding = await prisma.holding.create({
    data: {
      studentProfileId: profile.id,
      termId: term.id,
      productId: bondProduct.id,
      units: 2,
      avgCost: faceValue,
    },
  });

  const activeMaturityDate = new Date(
    now.getTime() + maturityWeeks * 7 * 24 * 60 * 60 * 1000,
  );

  await prisma.bondPosition.create({
    data: {
      termId: term.id,
      holdingId: bondHolding.id,
      units: 1,
      faceValue,
      couponRate,
      couponIntervalDays,
      startWeekNo: 1,
      maturityWeekNo: maturityWeeks,
      maturityDate: activeMaturityDate,
      purchasePrice: faceValue,
      purchaseAmount: faceValue,
      status: BondPositionStatus.ACTIVE,
      createdAt: now,
    },
  });

  console.log(
    `  ✅ ACTIVE bond: ซื้อวันนี้, ครบกำหนด ${activeMaturityDate.toISOString().slice(0, 10)}`,
  );

  // === 2. MATURED bond — purchased long ago, all coupons paid ===
  const purchasedAt = new Date(
    now.getTime() - (maturityWeeks * 7 + 3) * 24 * 60 * 60 * 1000,
  );
  const maturedMaturityDate = new Date(
    purchasedAt.getTime() + maturityWeeks * 7 * 24 * 60 * 60 * 1000,
  );

  const totalDays = Math.floor(
    (maturedMaturityDate.getTime() - purchasedAt.getTime()) /
      (24 * 60 * 60 * 1000),
  );
  const totalIntervals = Math.floor(totalDays / couponIntervalDays);

  // Calculate total coupon interest
  const couponAmount =
    faceValue * couponRate * (couponIntervalDays / 365) * 1;
  const totalInterest = Math.round(totalIntervals * couponAmount * 100) / 100;

  const maturedBond = await prisma.bondPosition.create({
    data: {
      termId: term.id,
      holdingId: bondHolding.id,
      units: 1,
      faceValue,
      couponRate,
      couponIntervalDays,
      startWeekNo: 1,
      maturityWeekNo: maturityWeeks,
      maturityDate: maturedMaturityDate,
      purchasePrice: faceValue,
      purchaseAmount: faceValue,
      status: BondPositionStatus.MATURED,
      createdAt: purchasedAt,
    },
  });

  // Create all coupon payouts for the matured bond
  const couponPayouts = [];
  for (let i = 1; i <= totalIntervals; i++) {
    couponPayouts.push({
      bondPositionId: maturedBond.id,
      weekNo: i,
      amount: couponAmount,
    });
  }

  if (couponPayouts.length > 0) {
    await prisma.bondCouponPayout.createMany({ data: couponPayouts });
  }

  console.log(
    `  ✅ MATURED bond: ซื้อ ${purchasedAt.toISOString().slice(0, 10)}, ครบกำหนด ${maturedMaturityDate.toISOString().slice(0, 10)}, ดอกเบี้ย ${couponPayouts.length} ครั้ง = ${totalInterest.toFixed(2)} coin`,
  );

  // Update wallet balance to include the coupon interest already credited
  await prisma.investmentWallet.update({
    where: { id: walletId },
    data: { balance: walletBalance + totalInterest },
  });

  // Record coupon transactions
  await prisma.investmentTransaction.create({
    data: {
      investmentWalletId: walletId,
      type: 'COUPON',
      amount: totalInterest,
      balanceBefore: walletBalance,
      balanceAfter: walletBalance + totalInterest,
      description: 'Seed: accumulated coupon interest for matured bond',
      metadata: {
        source: 'SEED_BOND_COUPON',
        bondPositionId: maturedBond.id,
        totalIntervals: couponPayouts.length,
      },
    },
  });

  console.log('✅ Seed ตำแหน่งพันธบัตรเสร็จสมบูรณ์');
}

module.exports = { seedBondPositions };
