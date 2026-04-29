/**
 * Seed Banks (and their configs: SavingsAccountBank, FixedDepositBank)
 */

async function seedBanks(prisma, academicData) {
  console.log('🏦 กำลังสร้างข้อมูลธนาคารสำหรับเทอมหลัก...');

  const { term } = academicData;

  const bankSeeds = [
    {
      name: 'ธนาคารยินดี',
      savingsConfig: {
        interestRate: 0.0075,
      },
      fdConfig: {
        interestRate: 0.0175,
        fixedDepositWeeks: 3,
        principal: 500,
      },
    },
    {
      name: 'ธนาคารพอใจ',
      savingsConfig: {
        interestRate: 0.01,
      },
      fdConfig: {
        interestRate: 0.02,
        fixedDepositWeeks: 6,
        principal: 500,
      },
    },
    {
      name: 'ธนาคารใจเย็น',
      savingsConfig: {
        interestRate: 0.0125,
      },
      fdConfig: {
        interestRate: 0.03,
        fixedDepositWeeks: 9,
        principal: 500,
      },
    },
  ];

  const banks = [];

  for (const bankSeed of bankSeeds) {
    let bankId;

    const existingBank = await prisma.bank.findFirst({
      where: {
        termId: term.id,
        name: bankSeed.name,
      },
      select: { id: true },
    });

    if (existingBank) {
      bankId = existingBank.id;
      await prisma.bank.update({
        where: { id: bankId },
        data: {
          name: bankSeed.name,
        },
      });
    } else {
      const bank = await prisma.bank.create({
        data: {
          termId: term.id,
          name: bankSeed.name,
        },
      });
      bankId = bank.id;
    }

    // Create/update savings account bank config (1-to-1)
    if (bankSeed.savingsConfig) {
      const existingSA = await prisma.savingsAccountBank.findUnique({
        where: { bankId },
      });
      if (existingSA) {
        await prisma.savingsAccountBank.update({
          where: { id: existingSA.id },
          data: {
            interestRate: bankSeed.savingsConfig.interestRate,
            withdrawLimitPerTerm: bankSeed.savingsConfig.withdrawLimitPerTerm,
            feePerTransaction: bankSeed.savingsConfig.feePerTransaction,
          },
        });
      } else {
        await prisma.savingsAccountBank.create({
          data: {
            bankId,
            interestRate: bankSeed.savingsConfig.interestRate,
            withdrawLimitPerTerm: bankSeed.savingsConfig.withdrawLimitPerTerm,
            feePerTransaction: bankSeed.savingsConfig.feePerTransaction,
          },
        });
      }
    }

    // Create/update fixed deposit bank config (1-to-1)
    if (bankSeed.fdConfig) {
      const existingFD = await prisma.fixedDepositBank.findUnique({
        where: { bankId },
      });
      if (existingFD) {
        await prisma.fixedDepositBank.update({
          where: { id: existingFD.id },
          data: {
            interestRate: bankSeed.fdConfig.interestRate,
            fixedDepositWeeks: bankSeed.fdConfig.fixedDepositWeeks,
            principal: bankSeed.fdConfig.principal,
          },
        });
      } else {
        await prisma.fixedDepositBank.create({
          data: {
            bankId,
            interestRate: bankSeed.fdConfig.interestRate,
            fixedDepositWeeks: bankSeed.fdConfig.fixedDepositWeeks,
            principal: bankSeed.fdConfig.principal,
          },
        });
      }
    }

    banks.push({ id: bankId, name: bankSeed.name });
  }

  console.log(`✅ ${banks.length} banks with configs seeded`);
  return banks;
}

module.exports = { seedBanks };
