import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { TermStatus } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { InvestmentService } from '../services/investment.service';

@Injectable()
export class LivePriceTickScheduler {
  private readonly logger = new Logger(LivePriceTickScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly investmentService: InvestmentService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleEveryMinuteGenerateTick() {
    const startedAt = Date.now();
    const enabled = process.env.MARKET_LIVE_TICK_CRON_ENABLED !== 'false';
    if (!enabled) {
      return;
    }

    const shouldLogEachRun =
      process.env.MARKET_LIVE_TICK_LOG_EACH_RUN !== 'false';

    const configuredTicksPerWeek = Number(
      process.env.MARKET_LIVE_TICKS_PER_WEEK ?? 10080,
    );
    const ticksPerWeek =
      Number.isFinite(configuredTicksPerWeek) && configuredTicksPerWeek > 0
        ? configuredTicksPerWeek
        : 10080;

    const configuredTermId = process.env.MARKET_LIVE_TICK_TERM_ID;

    const terms = configuredTermId
      ? [{ id: configuredTermId }]
      : await this.prisma.term.findMany({
          where: { status: TermStatus.ONGOING },
          select: { id: true },
        });

    let processedTerms = 0;
    let skippedTerms = 0;
    let failedTerms = 0;

    for (const term of terms) {
      const simulationCount = await this.prisma.productSimulation.count({
        where: { termId: term.id },
      });

      if (simulationCount === 0) {
        skippedTerms += 1;
        continue;
      }

      try {
        await this.investmentService.generateLiveTicks(term.id, {
          ticksPerWeek,
        });
        processedTerms += 1;
      } catch (error) {
        failedTerms += 1;
        this.logger.warn(
          `Failed to generate live tick for term ${term.id}: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      }
    }

    if (shouldLogEachRun) {
      this.logger.log(
        `Live tick cron ran in ${Date.now() - startedAt}ms | terms=${terms.length}, processed=${processedTerms}, skipped=${skippedTerms}, failed=${failedTerms}, ticksPerWeek=${ticksPerWeek}`,
      );
    }
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async handleEveryTenMinutesSnapshotProductPrice() {
    const enabled = process.env.MARKET_PRODUCT_PRICE_CRON_ENABLED !== 'false';
    if (!enabled) {
      return;
    }

    const configuredTermId = process.env.MARKET_LIVE_TICK_TERM_ID;
    const terms = configuredTermId
      ? [{ id: configuredTermId }]
      : await this.prisma.term.findMany({
          where: { status: TermStatus.ONGOING },
          select: { id: true },
        });

    for (const term of terms) {
      try {
        await this.investmentService.finalizeLiveWeek(term.id, {
          moveCurrentWeekToNext: false,
          clearTicksAfterFinalize: false,
        });
      } catch (error) {
        this.logger.warn(
          `Failed to snapshot product prices for term ${term.id}: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      }
    }
  }
}
