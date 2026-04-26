import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from 'src/prisma/prisma.service';
import { RandomExpenseService } from '../services/random-expense.service';
import { TermStatus } from '@prisma/client';

/**
 * Scheduler that automatically triggers weekly random expense generation.
 * Runs every Monday at 00:05 Bangkok time (UTC+7 = 17:05 UTC Sunday).
 */
@Injectable()
export class RandomExpenseScheduler {
  private readonly logger = new Logger(RandomExpenseScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly randomExpenseService: RandomExpenseService,
  ) {}

  /**
   * Cron: Every Monday at 00:05 Bangkok time
   * UTC cron: '5 17 * * 0' (Sunday 17:05 UTC = Monday 00:05 Bangkok)
   */
  @Cron('5 17 * * 0')
  async handleWeeklyExpenseGeneration() {
    this.logger.log('🕐 Starting weekly random expense generation...');

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

      for (const term of ongoingTerms) {
        try {
          this.logger.log(`Processing term: ${term.name} (${term.id})`);

          const result = await this.randomExpenseService.triggerWeeklyExpenses({
            termId: term.id,
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

      this.logger.log('✅ Weekly random expense generation completed.');
    } catch (error) {
      this.logger.error(
        `Weekly expense generation failed: ${error.message}`,
        error.stack,
      );
    }
  }
}
