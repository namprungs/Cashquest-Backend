import { Injectable } from '@nestjs/common';
import {
  BondPositionStatus,
  InvestmentTransactionType,
  ProductType,
} from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { toNumber } from 'src/common/utils/number.utils';
import { ProcessPayoutsDto } from '../../dto/process-payouts.dto';
import { InvestmentCoreService } from './investment-core.service';

@Injectable()
export class PayoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly core: InvestmentCoreService,
  ) {}

  async processPayouts(termId: string, dto: ProcessPayoutsDto) {
    await this.core.assertTermExists(termId);

    const weekNo = dto.weekNo ?? (await this.core.getCurrentWeek(termId));
    const manualDividendPerUnit = dto.dividendPerUnit;

    let dividendCount = 0;
    let couponCount = 0;

    await this.prisma.$transaction(async (tx) => {
      const holdings = await tx.holding.findMany({
        where: {
          termId,
          units: {
            gt: 0,
          },
          product: {
            type: ProductType.STOCK,
            isDividendEnabled: true,
          },
        },
        include: {
          product: true,
          studentProfile: {
            include: {
              investmentWallet: true,
            },
          },
        },
      });

      for (const holding of holdings) {
        const intervalWeeks = Math.max(
          1,
          holding.product.dividendPayoutIntervalWeeks ?? 4,
        );

        if (weekNo % intervalWeeks !== 0) {
          continue;
        }

        const existingDividend = await tx.dividendPayout.findFirst({
          where: {
            termId,
            productId: holding.productId,
            studentProfileId: holding.studentProfileId,
            weekNo,
          },
          select: { id: true },
        });

        if (existingDividend) {
          continue;
        }

        const units = toNumber(holding.units);
        let dividendPerUnit = manualDividendPerUnit;

        if (dividendPerUnit === undefined || dividendPerUnit <= 0) {
          dividendPerUnit = toNumber(holding.product.fixedDividendPerUnit ?? 0);
        }

        if (dividendPerUnit <= 0) {
          const yieldAnnual = toNumber(
            holding.product.dividendYieldAnnual ?? 0,
          );
          if (yieldAnnual > 0) {
            const latestPrice = await tx.productPrice.findFirst({
              where: {
                termId,
                productId: holding.productId,
                weekNo: { lte: weekNo },
              },
              orderBy: [{ weekNo: 'desc' }, { createdAt: 'desc' }],
              select: { close: true },
            });

            const closePrice = toNumber(latestPrice?.close ?? 0);
            const payoutsPerYear = Math.max(1, 52 / intervalWeeks);
            dividendPerUnit =
              closePrice > 0 ? (closePrice * yieldAnnual) / payoutsPerYear : 0;
          }
        }

        if (dividendPerUnit <= 0) {
          continue;
        }

        const amount = units * dividendPerUnit;

        await tx.dividendPayout.create({
          data: {
            termId,
            productId: holding.productId,
            studentProfileId: holding.studentProfileId,
            weekNo,
            units,
            dividendPerUnit,
            amount,
          },
        });

        if (holding.studentProfile.investmentWallet) {
          const walletBalance = toNumber(
            holding.studentProfile.investmentWallet.balance,
          );
          await tx.investmentWallet.update({
            where: { id: holding.studentProfile.investmentWallet.id },
            data: {
              balance: walletBalance + amount,
            },
          });

          await tx.investmentTransaction.create({
            data: {
              investmentWalletId: holding.studentProfile.investmentWallet.id,
              type: InvestmentTransactionType.DIVIDEND,
              amount,
              balanceBefore: walletBalance,
              balanceAfter: walletBalance + amount,
              description: 'Dividend payout credited to investment wallet',
              metadata: {
                source: 'DIVIDEND_PAYOUT',
                productId: holding.productId,
                termId,
                weekNo,
                intervalWeeks,
              },
            },
          });
        }

        dividendCount += 1;
      }

      const bonds = await tx.bondPosition.findMany({
        where: {
          termId,
          status: BondPositionStatus.ACTIVE,
          startWeekNo: { lte: weekNo },
          maturityWeekNo: { gte: weekNo },
        },
        include: {
          holding: {
            include: {
              studentProfile: {
                include: {
                  investmentWallet: true,
                },
              },
            },
          },
        },
      });

      for (const bond of bonds) {
        const elapsed = weekNo - bond.startWeekNo;
        if (elapsed <= 0) {
          continue;
        }

        if (elapsed % bond.couponIntervalWeeks !== 0) {
          continue;
        }

        const already = await tx.bondCouponPayout.findFirst({
          where: {
            bondPositionId: bond.id,
            weekNo,
          },
          select: { id: true },
        });

        if (already) {
          continue;
        }

        const couponAmount =
          toNumber(bond.faceValue) *
          toNumber(bond.couponRate) *
          (bond.couponIntervalWeeks / 52) *
          toNumber(bond.units);

        await tx.bondCouponPayout.create({
          data: {
            bondPositionId: bond.id,
            weekNo,
            amount: couponAmount,
          },
        });

        if (bond.holding.studentProfile.investmentWallet) {
          const walletBalance = toNumber(
            bond.holding.studentProfile.investmentWallet.balance,
          );
          await tx.investmentWallet.update({
            where: { id: bond.holding.studentProfile.investmentWallet.id },
            data: {
              balance: walletBalance + couponAmount,
            },
          });

          await tx.investmentTransaction.create({
            data: {
              investmentWalletId:
                bond.holding.studentProfile.investmentWallet.id,
              type: 'COUPON' as unknown as InvestmentTransactionType,
              amount: couponAmount,
              balanceBefore: walletBalance,
              balanceAfter: walletBalance + couponAmount,
              description: 'Bond coupon payout credited to investment wallet',
              metadata: {
                source: 'BOND_COUPON_PAYOUT',
                bondPositionId: bond.id,
                termId,
                weekNo,
                units: toNumber(bond.units),
                couponIntervalWeeks: bond.couponIntervalWeeks,
              },
            },
          });
        }

        couponCount += 1;
      }
    });

    return {
      success: true,
      data: {
        weekNo,
        dividendCount,
        couponCount,
      },
    };
  }
}
