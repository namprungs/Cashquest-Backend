import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma } from '@prisma/client';

// @Injectable()
export class SavingsInterestService {
  private readonly logger = new Logger(SavingsInterestService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Daily cron job - runs every midnight
   * Cron expression: '0 0 * * *'
   * Pays out interest on the 1st and 15th of each month.
   * Interest rate is monthly rate × 2, scaled by payout period: balance × (monthlyRate × 2 ÷ monthDays) × periodDays
   */
  @Cron('0 0 * * *')
  async handleDailyInterest() {
    const today = new Date();
    const dayOfMonth = today.getDate();

    this.logger.log(`Starting daily savings interest job (day ${dayOfMonth})`);

    // Determine payout window for today (1st and 15th only)
    const payout = this.getPayoutPeriod(today);
    if (!payout) {
      this.logger.debug('Not a payout day; daily accrual computed but not paid out yet.');
      return;
    }

    const { periodStart, periodEnd, periodDays, monthDays, label } = payout;

    this.logger.log(
      `Payout day '${label}': applying interest for ${periodDays} days from ${periodStart.toISOString().slice(0, 10)} to ${periodEnd
        .toISOString()
        .slice(0, 10)} (monthDays=${monthDays})`,
    );

    try {
      const currentWeekNo = await this.getCurrentWeekNo();

      if (!currentWeekNo) {
        this.logger.warn('Could not determine current week number, skipping interest payout calculation');
        return;
      }

      const accounts = await this.prisma.savingsAccount.findMany({
        where: { status: 'ACTIVE' },
        include: {
          bank: {
            select: {
              id: true,
              interestRate: true,
            },
          },
          studentProfile: {
            select: {
              termId: true,
            },
          },
        },
      });

      this.logger.log(`Found ${accounts.length} active savings accounts to process`);

      let processedCount = 0;
      let totalInterest = new Prisma.Decimal(0);

      for (const account of accounts) {
        try {
          const interestResult = await this.applyInterest(account, currentWeekNo, periodDays, monthDays);
          if (interestResult) {
            processedCount++;
            totalInterest = totalInterest.add(interestResult.interestAmount);
          }
        } catch (error) {
          this.logger.error(
            `Failed to apply interest for account ${account.id}: ${error.message}`,
            error.stack,
          );
        }
      }

      this.logger.log(
        `Daily interest job completed. Processed: ${processedCount}/${accounts.length} accounts, Total interest: ${totalInterest.toString()}`,
      );
    } catch (error) {
      this.logger.error(`Daily interest job failed: ${error.message}`, error.stack);
    }
  }

  /**
   * Apply interest to a single savings account
   */
  private async applyInterest(
    account: any,
    weekNo: number,
    periodDays: number,
    monthDays: number,
  ): Promise<{ interestAmount: Prisma.Decimal } | null> {
    const balance = new Prisma.Decimal(account.balance);
    const rate = new Prisma.Decimal(account.bank.interestRate);

    // Skip if balance is zero or negative, or rate is zero
    if (balance.lte(0) || rate.lte(0)) {
      return null;
    }

    // Interest = balance × (monthlyRate × 2 ÷ monthDays) × periodDays
    // Monthly rate is multiplied by 2 for the calculation
    const dailyRate = rate.mul(new Prisma.Decimal(2)).div(new Prisma.Decimal(monthDays));
    const interestAmount = balance.mul(dailyRate).mul(new Prisma.Decimal(periodDays));

    // Round to 2 decimal places
    const roundedInterest = interestAmount.toDecimalPlaces(2);

    if (roundedInterest.lte(0)) {
      return null;
    }

    await this.prisma.$transaction(async (tx) => {
      // 1. Insert interest log
      await tx.savingsInterestLog.create({
        data: {
          savingsAccountId: account.id,
          weekNo,
          rateUsed: rate,
          interestAmount: roundedInterest,
        },
      });

      // 2. Update account balance
      const updatedBalance = balance.add(roundedInterest);
      await tx.savingsAccount.update({
        where: { id: account.id },
        data: {
          balance: updatedBalance,
        },
      });

      // 3. Record savings transaction for interest payout
      await tx.savingsTransaction.create({
        data: {
          savingsAccountId: account.id,
          type: 'INTEREST',
          amount: roundedInterest,
          balanceAfter: updatedBalance,
        },
      });
    });

    this.logger.debug(
      `Applied interest to account ${account.id}: ${roundedInterest.toString()} (balance: ${balance.toString()} * daily rate: ${dailyRate.toString()} * periodDays: ${periodDays})`,
    );

    return { interestAmount: roundedInterest };
  }

  /**
   * Manual trigger for testing the interest calculation
   * This can be called via an admin endpoint for testing purposes
   */
  async triggerInterestCalculation(): Promise<{
    success: boolean;
    message: string;
    processedAccounts: number;
    totalInterest: string;
  }> {
    this.logger.log('Manually triggering interest calculation');

    try {
      const currentWeekNo = await this.getCurrentWeekNo();

      if (!currentWeekNo) {
        return {
          success: false,
          message: 'Could not determine current week number',
          processedAccounts: 0,
          totalInterest: '0',
        };
      }

      const accounts = await this.prisma.savingsAccount.findMany({
        where: { status: 'ACTIVE' },
        include: {
          bank: {
            select: {
              id: true,
              interestRate: true,
            },
          },
          studentProfile: {
            select: {
              termId: true,
            },
          },
        },
      });

      let processedCount = 0;
      let totalInterest = new Prisma.Decimal(0);

      const payout = this.getPayoutPeriod(new Date());
      if (!payout) {
        return {
          success: false,
          message: 'Today is not a configured payout day (1 or 15)',
          processedAccounts: 0,
          totalInterest: '0',
        };
      }

      const { periodDays, monthDays } = payout;

      for (const account of accounts) {
        try {
          const interestResult = await this.applyInterest(account, currentWeekNo, periodDays, monthDays);
          if (interestResult) {
            processedCount++;
            totalInterest = totalInterest.add(interestResult.interestAmount);
          }
        } catch (error) {
          this.logger.error(
            `Failed to apply interest for account ${account.id}: ${error.message}`,
          );
        }
      }

      return {
        success: true,
        message: `Interest calculation completed successfully`,
        processedAccounts: processedCount,
        totalInterest: totalInterest.toString(),
      };
    } catch (error) {
      this.logger.error(`Manual interest calculation failed: ${error.message}`);
      return {
        success: false,
        message: `Interest calculation failed: ${error.message}`,
        processedAccounts: 0,
        totalInterest: '0',
      };
    }
  }

  /**
   * Get the current week number for interest calculation
   * This is based on the current date and term weeks
   */
  private async getCurrentWeekNo(): Promise<number | null> {
    try {
      const now = new Date();

      // Only run for terms that are currently active (status = ONGOING) and contain today's date.
      const activeTerm = await this.prisma.term.findFirst({
        where: {
          status: 'ONGOING',
          startDate: { lte: now },
          endDate: { gte: now },
        },
        include: {
          termWeeks: {
            orderBy: { weekNo: 'asc' },
          },
        },
      });

      if (!activeTerm) {
        this.logger.warn(`No active term found for current date ${now.toISOString()}`);
        return null;
      }

      if (!activeTerm.termWeeks?.length) {
        this.logger.warn(`Active term ${activeTerm.id} has no term weeks defined`);
        return null;
      }

      const currentDateString = this.formatLocalDate(now);
      const currentWeek = activeTerm.termWeeks.find((week) => {
        const startDateString = this.formatLocalDate(new Date(week.startDate));
        const endDateString = this.formatLocalDate(new Date(week.endDate));
        return currentDateString >= startDateString && currentDateString <= endDateString;
      });

      if (!currentWeek) {
        this.logger.warn(`No current week found in active term ${activeTerm.id} for ${now.toISOString()}`);
        return null;
      }

      return currentWeek.weekNo;
    } catch (error) {
      this.logger.error(`Failed to get current week number: ${error.message}`);
      return null;
    }
  }

  private getPayoutPeriod(date: Date):
    | {
        periodStart: Date;
        periodEnd: Date;
        periodDays: number;
        monthDays: number;
        label: string;
      }
    | null {
    const day = date.getDate();

    if (day === 15) {
      const year = date.getFullYear();
      const month = date.getMonth();
      const monthDays = new Date(year, month + 1, 0).getDate();

      return {
        periodStart: new Date(year, month, 1),
        periodEnd: new Date(year, month, 14),
        periodDays: 14,
        monthDays,
        label: '1-14',
      };
    }

    if (day === 1) {
      const year = date.getFullYear();
      const month = date.getMonth();
      const prevMonthYear = month === 0 ? year - 1 : year;
      const prevMonth = month === 0 ? 11 : month - 1;
      const prevMonthDays = new Date(prevMonthYear, prevMonth + 1, 0).getDate();
      const periodDays = prevMonthDays - 15;

      if (periodDays <= 0) {
        return null;
      }

      return {
        periodStart: new Date(prevMonthYear, prevMonth, 16),
        periodEnd: new Date(prevMonthYear, prevMonth, prevMonthDays),
        periodDays,
        monthDays: prevMonthDays,
        label: '16-end previous month',
      };
    }

    return null;
  }

  private calculateWeekFromTerm(term: any, date: Date): number | null {
    if (!term.termWeeks || term.termWeeks.length === 0) return null;

    const termStart = new Date(term.termWeeks[0].startDate);
    const diffMs = date.getTime() - termStart.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return null; // date is before the term start
    }

    const weekNo = Math.floor(diffDays / 7) + 1;

    // Clamp to available week range
    const maxWeek = term.termWeeks[term.termWeeks.length - 1].weekNo;
    if (weekNo > maxWeek) {
      return maxWeek;
    }

    return weekNo;
  }

  private formatLocalDate(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
      date.getDate(),
    )}`;
  }
}
