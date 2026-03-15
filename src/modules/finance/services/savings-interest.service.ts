import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma } from '@prisma/client';

// @Injectable()
export class SavingsInterestService {
  private readonly logger = new Logger(SavingsInterestService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Biweekly cron job - runs on 1st and 15th of every month at 00:00
   * Cron expression: '0 0 1,15 * *'
   * This gives interest to students every 1st and 15th of the month
   */
  @Cron('0 0 1,15 * *')
  async handleBiweeklyInterest() {
    this.logger.log('Starting biweekly savings interest job');

    try {
      // Get current week number for the term
      const currentWeekNo = await this.getCurrentWeekNo();

      if (!currentWeekNo) {
        this.logger.warn('Could not determine current week number, skipping interest calculation');
        return;
      }

      // Get all active savings accounts with their bank details
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
          const interestResult = await this.applyInterest(account, currentWeekNo);
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
        `Biweekly interest job completed. Processed: ${processedCount}/${accounts.length} accounts, Total interest: ${totalInterest.toString()}`,
      );
    } catch (error) {
      this.logger.error(
        `Biweekly interest job failed: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Apply interest to a single savings account
   */
  private async applyInterest(
    account: any,
    weekNo: number,
  ): Promise<{ interestAmount: Prisma.Decimal } | null> {
    const balance = new Prisma.Decimal(account.balance);
    const rate = new Prisma.Decimal(account.bank.interestRate);

    // Skip if balance is zero or negative, or rate is zero
    if (balance.lte(0) || rate.lte(0)) {
      return null;
    }

    // Calculate interest: balance * rate
    // For biweekly interest, we calculate based on the full balance
    const interestAmount = balance.mul(rate);

    // Round to 2 decimal places
    const roundedInterest = interestAmount.toDecimalPlaces(2);

    if (roundedInterest.lte(0)) {
      return null;
    }

    // Apply interest in a transaction
    await this.prisma.$transaction(async (tx) => {
      // 1. Insert interest log
      await tx.savingsInterestLog.create({
        data: {
          savingsAccountId: account.id,
          weekNo: weekNo,
          rateUsed: rate,
          interestAmount: roundedInterest,
        },
      });

      // 2. Update account balance
      await tx.savingsAccount.update({
        where: { id: account.id },
        data: {
          balance: balance.add(roundedInterest),
        },
      });
    });

    this.logger.debug(
      `Applied interest to account ${account.id}: ${roundedInterest.toString()} (balance: ${balance.toString()} * rate: ${rate.toString()})`,
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

      for (const account of accounts) {
        try {
          const interestResult = await this.applyInterest(account, currentWeekNo);
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
