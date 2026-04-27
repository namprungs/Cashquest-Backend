const { OrderSide, OrderType, OrderStatus, InvestmentTransactionType } = require('@prisma/client');

/**
 * Seed market demo students with investment portfolios
 * Creates:
 * - 3 demo student users
 * - Investment wallets with holdings (stocks)
 * - Buy/Sell orders
 * - Investment transactions
 */
async function seedMarketStudents(
  prisma,
  academicData,
  products,
  classroom,
  roles,
) {
  console.log('👥 กำลัง seed ผู้เล่นตลาดเพิ่มเติมสำหรับทีม...');

  const { term } = academicData;
  const studentRole = roles.studentRole;
  
  // Use the same hashed password as in seed-users.js (Student@1234 hashed)
  const studentPassword = '$2b$10$aMdsmLCy1kJN8YEjO0qkfO.dZT.LJ6gVlxN8KJEIqRJ5Ay2Lqk3R2';

  // Get latest prices for market valuation
  const latestPriceRows = await prisma.productPrice.findMany({
    where: {
      termId: term.id,
      productId: { in: products.map((product) => product.id) },
    },
    orderBy: [{ weekNo: 'desc' }, { createdAt: 'desc' }],
  });

  const latestPriceByProductId = new Map();
  for (const row of latestPriceRows) {
    if (!latestPriceByProductId.has(row.productId)) {
      latestPriceByProductId.set(row.productId, Number(row.close));
    }
  }

  const productBySymbol = new Map(
    products.map((product) => [product.symbol, product]),
  );

  // Get current market week from term simulation
  const termSim = await prisma.termSimulation.findUnique({
    where: { termId: term.id },
  });
  const currentMarketWeek = termSim?.currentWeek ?? 1;

  const marketStudentSeeds = [
    {
      email: 'student@school.com',
      username: 'student_demo',
      mainWalletBalance: 250000,
      investmentCash: 90000,
      holdings: [
        { symbol: 'SCHMART', units: 200, avgCost: 84 },
        { symbol: 'GRNPWR', units: 150, avgCost: 108 },
      ],
    },
    {
      email: 'student2@school.com',
      username: 'student_demo_2',
      mainWalletBalance: 200000,
      investmentCash: 120000,
      holdings: [
        { symbol: 'TWAV', units: 100, avgCost: 128 },
        { symbol: 'HLTHPLS', units: 300, avgCost: 94 },
      ],
    },
    {
      email: 'student3@school.com',
      username: 'student_demo_3',
      mainWalletBalance: 180000,
      investmentCash: 70000,
      holdings: [
        { symbol: 'FSTFIN', units: 350, avgCost: 74 },
        { symbol: 'GHUB', units: 280, avgCost: 59 },
      ],
    },
  ];

  for (const studentSeed of marketStudentSeeds) {
    // Upsert user
    const user = await prisma.user.upsert({
      where: { email: studentSeed.email },
      update: {
        username: studentSeed.username,
        roleId: studentRole.id,
        isActive: true,
      },
      create: {
        email: studentSeed.email,
        username: studentSeed.username,
        password: studentPassword,
        roleId: studentRole.id,
        isActive: true,
      },
    });

    // Link to classroom
    await prisma.classroomStudent.upsert({
      where: {
        classroomId_studentId: {
          classroomId: classroom.id,
          studentId: user.id,
        },
      },
      update: {},
      create: {
        classroomId: classroom.id,
        studentId: user.id,
      },
    });

    // Create student profile for this term
    const profile = await prisma.studentProfile.upsert({
      where: {
        userId_termId: {
          userId: user.id,
          termId: term.id,
        },
      },
      update: {},
      create: {
        userId: user.id,
        termId: term.id,
      },
    });

    // Create main wallet
    await prisma.wallet.upsert({
      where: { studentProfileId: profile.id },
      update: { balance: studentSeed.mainWalletBalance },
      create: {
        studentProfileId: profile.id,
        balance: studentSeed.mainWalletBalance,
      },
    });

    // Create/update investment wallet
    const investmentWallet = await prisma.investmentWallet.upsert({
      where: { studentProfileId: profile.id },
      update: {
        termId: term.id,
        balance: studentSeed.investmentCash,
      },
      create: {
        studentProfileId: profile.id,
        termId: term.id,
        balance: studentSeed.investmentCash,
      },
      select: { id: true },
    });

    // Clean up old data
    await prisma.order.deleteMany({
      where: {
        termId: term.id,
        studentProfileId: profile.id,
      },
    });

    await prisma.holding.deleteMany({
      where: {
        termId: term.id,
        studentProfileId: profile.id,
      },
    });

    await prisma.investmentTransaction.deleteMany({
      where: {
        investmentWalletId: investmentWallet.id,
      },
    });

    // Create holdings and orders for each stock
    for (const holdingSeed of studentSeed.holdings) {
      const product = productBySymbol.get(holdingSeed.symbol);
      if (!product) continue;

      // Create holding
      await prisma.holding.create({
        data: {
          studentProfileId: profile.id,
          termId: term.id,
          productId: product.id,
          units: holdingSeed.units,
          avgCost: holdingSeed.avgCost,
        },
      });

      const marketPrice =
        latestPriceByProductId.get(product.id) ?? holdingSeed.avgCost;

      // Create BUY and SELL orders
      await prisma.order.createMany({
        data: [
          {
            studentProfileId: profile.id,
            termId: term.id,
            productId: product.id,
            side: OrderSide.BUY,
            orderType: OrderType.MARKET,
            requestedPrice: null,
            executedPrice: holdingSeed.avgCost,
            quantity: holdingSeed.units,
            fee: 0,
            weekNo: Math.max(1, currentMarketWeek - 1),
            status: OrderStatus.EXECUTED,
          },
          {
            studentProfileId: profile.id,
            termId: term.id,
            productId: product.id,
            side: OrderSide.SELL,
            orderType: OrderType.MARKET,
            requestedPrice: null,
            executedPrice: marketPrice,
            quantity: Number((holdingSeed.units * 0.1).toFixed(6)),
            fee: 0,
            weekNo: currentMarketWeek,
            status: OrderStatus.EXECUTED,
          },
        ],
      });
    }

    // Record investment transaction
    const investedCost = studentSeed.holdings.reduce(
      (sum, item) => sum + item.units * item.avgCost,
      0,
    );
    const transferInAmount = investedCost + studentSeed.investmentCash;

    await prisma.investmentTransaction.create({
      data: {
        investmentWalletId: investmentWallet.id,
        type: InvestmentTransactionType.TRANSFER_IN,
        amount: transferInAmount,
        balanceBefore: 0,
        balanceAfter: studentSeed.investmentCash,
        metadata: {
          source: 'MAIN_WALLET',
          note: 'seed-market-bootstrap',
        },
        description: 'Seed transfer into investment wallet',
      },
    });

    console.log(`  ✅ Created market student: ${studentSeed.email}`);
  }

  console.log(`✅ Seeded ${marketStudentSeeds.length} market demo students`);
}

module.exports = { seedMarketStudents };
