import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from 'src/prisma/prisma.service';
import { RandomExpenseService } from '../services/random-expense.service';
import { TermStatus } from '@prisma/client';

/**
 * Scheduler that automatically triggers daily random expense generation.
 * Runs every Monday–Friday at 00:05 Bangkok time (UTC+7 = 17:05 UTC previous day).
 */
@Injectable()
export class RandomExpenseScheduler {
  private readonly logger = new Logger(RandomExpenseScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly randomExpenseService: RandomExpenseService,
  ) {}

  /**
   * Cron: Every Monday–Friday at 00:05 Bangkok time
   * Bangkok = UTC+7, so 00:05 Bangkok = 17:05 UTC previous day.
   * UTC cron: '5 17 * * 0-4' (Sun–Thu UTC = Mon–Fri Bangkok)
   */
  @Cron('5 17 * * 0-4')
  async handleDailyExpenseGeneration() {
    this.logger.log('🕐 Starting daily random expense generation...');

    try {
      // Find all ongoing terms
      const ongoingTerms = await this.prisma.term.findMany({
        where: { status: TermStatus.ONGOING },
        select: { id: true, name: true },
      });

      if (ongoingTerms.length === 0) {
        this.logger.log('No ongoing terms found. Skipping.');
        return;
      }

      // Determine Bangkok day-of-week (1=Mon..5=Fri)
      const nowBangkok = new Date(
        new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }),
      );
      const jsDay = nowBangkok.getDay(); // 0=Sun..6=Sat
      const dayOfWeek = jsDay === 0 ? 7 : jsDay; // ISO: 1=Mon..7=Sun

      for (const term of ongoingTerms) {
        try {
          this.logger.log(`Processing term: ${term.name} (${term.id})`);

          const result = await this.randomExpenseService.triggerWeeklyExpenses({
            termId: term.id,
            dayOfWeek,
          });

          this.logger.log(
            `Term "${term.name}" completed: processed=${result.processed}, paid=${result.paid}, unpaid=${result.unpaid}`,
          );

          if (result.errors.length > 0) {
            this.logger.warn(
              `Errors in term "${term.name}": ${result.errors.join('; ')}`,
            );
          }
        } catch (error) {
          this.logger.error(
            `Failed to process term ${term.id}: ${error.message}`,
            error.stack,
          );
        }
      }

      this.logger.log('✅ Daily random expense generation completed.');
    } catch (error) {
      this.logger.error(
        `Daily expense generation failed: ${error.message}`,
        error.stack,
      );
    }
  }
}
