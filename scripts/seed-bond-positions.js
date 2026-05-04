const { BondPositionStatus, InvestmentTransactionType } = require('@prisma/client');

/**
 * Seed 3 bond positions for the first student:
 * 1. ACTIVE — just purchased today
 * 2. MATURED — past maturity, all coupons paid, waiting for principal
 * 3. CLOSED — already redeemed (principal + interest received)
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
  let walletBalance = Number(profile.investmentWallet.balance);

  const faceValue = 10000;
  const couponRate = 0.028;
  const couponIntervalDays = 2;
  const maturityWeeks = 10;
  const totalReturnRate = 0.70;
  const totalPayouts = Math.floor((maturityWeeks * 7) / couponIntervalDays);
  const couponAmountPerPayout = (faceValue * totalReturnRate) / totalPayouts;
  const now = new Date();

  // One holding with 3 units for all 3 bond positions
  const bondHolding = await prisma.holding.create({
    data: {
      studentProfileId: profile.id,
      termId: term.id,
      productId: bondProduct.id,
      units: 3,
      avgCost: faceValue,
    },
  });

  // ============================================================
  // 1. ACTIVE bond — just purchased today
  // ============================================================
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
      couponAmountPerPayout,
      status: BondPositionStatus.ACTIVE,
      createdAt: now,
    },
  });

  console.log(
    `  ✅ ACTIVE bond: ซื้อวันนี้, ครบกำหนด ${activeMaturityDate.toISOString().slice(0, 10)}, ดอกเบี้ย/ครั้ง = ${couponAmountPerPayout.toFixed(2)} coin`,
  );

  // ============================================================
  // 2. MATURED bond — past maturity, all coupons paid, waiting
  // ============================================================
  const maturedPurchasedAt = new Date(
    now.getTime() - (maturityWeeks * 7 + 3) * 24 * 60 * 60 * 1000,
  );
  const maturedMaturityDate = new Date(
    maturedPurchasedAt.getTime() + maturityWeeks * 7 * 24 * 60 * 60 * 1000,
  );

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
      couponAmountPerPayout,
      status: BondPositionStatus.MATURED,
      createdAt: maturedPurchasedAt,
    },
  });

  // All coupon payouts for the matured bond
  const maturedCoupons = [];
  for (let i = 1; i <= totalPayouts; i++) {
    maturedCoupons.push({
      bondPositionId: maturedBond.id,
      weekNo: i,
      amount: couponAmountPerPayout,
    });
  }
  if (maturedCoupons.length > 0) {
    await prisma.bondCouponPayout.createMany({ data: maturedCoupons });
  }

  const maturedTotalInterest =
    Math.round(totalPayouts * couponAmountPerPayout * 100) / 100;

  // Credit coupon interest to wallet
  walletBalance += maturedTotalInterest;

  console.log(
    `  ✅ MATURED bond: ซื้อ ${maturedPurchasedAt.toISOString().slice(0, 10)}, ครบกำหนด ${maturedMaturityDate.toISOString().slice(0, 10)}, ดอกเบี้ย ${maturedCoupons.length} ครั้ง = ${maturedTotalInterest.toFixed(2)} coin, รอรับเงินต้น`,
  );

  // ============================================================
  // 3. CLOSED bond — already redeemed (principal + interest)
  // ============================================================
  const closedPurchasedAt = new Date(
    now.getTime() - (maturityWeeks * 7 + 10) * 24 * 60 * 60 * 1000,
  );
  const closedMaturityDate = new Date(
    closedPurchasedAt.getTime() + maturityWeeks * 7 * 24 * 60 * 60 * 1000,
  );
  const closedRedeemedAt = new Date(
    closedMaturityDate.getTime() + 3 * 24 * 60 * 60 * 1000,
  );

  const closedBond = await prisma.bondPosition.create({
    data: {
      termId: term.id,
      holdingId: bondHolding.id,
      units: 1,
      faceValue,
      couponRate,
      couponIntervalDays,
      startWeekNo: 1,
      maturityWeekNo: maturityWeeks,
      maturityDate: closedMaturityDate,
      purchasePrice: faceValue,
      purchaseAmount: faceValue,
      couponAmountPerPayout,
      status: BondPositionStatus.CLOSED,
      createdAt: closedPurchasedAt,
      updatedAt: closedRedeemedAt,
    },
  });

  // All coupon payouts for the closed bond
  const closedCoupons = [];
  for (let i = 1; i <= totalPayouts; i++) {
    closedCoupons.push({
      bondPositionId: closedBond.id,
      weekNo: i,
      amount: couponAmountPerPayout,
    });
  }
  if (closedCoupons.length > 0) {
    await prisma.bondCouponPayout.createMany({ data: closedCoupons });
  }

  const closedTotalInterest =
    Math.round(totalPayouts * couponAmountPerPayout * 100) / 100;

  console.log(
    `  ✅ CLOSED bond: ซื้อ ${closedPurchasedAt.toISOString().slice(0, 10)}, ครบกำหนด ${closedMaturityDate.toISOString().slice(0, 10)}, ดอกเบี้ย ${closedCoupons.length} ครั้ง = ${closedTotalInterest.toFixed(2)} coin, ไถ่ถอนแล้ว`,
  );

  // ============================================================
  // Update wallet + create transactions
  // ============================================================
  const totalCredit = maturedTotalInterest + closedTotalInterest + faceValue;
  const balanceBefore = walletBalance - totalCredit; // what it was before all credits

  await prisma.investmentWallet.update({
    where: { id: walletId },
    data: { balance: walletBalance + faceValue },
  });

  // Coupon interest transaction for matured bond
  await prisma.investmentTransaction.create({
    data: {
      investmentWalletId: walletId,
      type: InvestmentTransactionType.COUPON,
      amount: maturedTotalInterest,
      balanceBefore: balanceBefore,
      balanceAfter: balanceBefore + maturedTotalInterest,
      description: 'Seed: coupon interest for matured bond',
      metadata: {
        source: 'SEED_BOND_COUPON',
        bondPositionId: maturedBond.id,
      },
    },
  });

  // Coupon interest transaction for closed bond
  await prisma.investmentTransaction.create({
    data: {
      investmentWalletId: walletId,
      type: InvestmentTransactionType.COUPON,
      amount: closedTotalInterest,
      balanceBefore: balanceBefore + maturedTotalInterest,
      balanceAfter: balanceBefore + maturedTotalInterest + closedTotalInterest,
      description: 'Seed: coupon interest for redeemed bond',
      metadata: {
        source: 'SEED_BOND_COUPON',
        bondPositionId: closedBond.id,
      },
    },
  });

  // Redeem transaction for closed bond (principal return)
  await prisma.investmentTransaction.create({
    data: {
      investmentWalletId: walletId,
      type: InvestmentTransactionType.REDEEM,
      amount: faceValue,
      balanceBefore: walletBalance,
      balanceAfter: walletBalance + faceValue,
      description: 'Seed: bond principal redeemed',
      metadata: {
        source: 'SEED_BOND_PRINCIPAL_REDEEM',
        bondPositionId: closedBond.id,
      },
    },
  });

  console.log('✅ Seed ตำแหน่งพันธบัตรเสร็จสมบูรณ์');
}

module.exports = { seedBondPositions };
