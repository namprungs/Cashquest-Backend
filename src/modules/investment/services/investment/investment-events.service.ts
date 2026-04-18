import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, TermEventStatus } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { ListTermEventsQueryDto } from '../../dto/list-term-events-query.dto';
import { InvestmentCoreService } from './investment-core.service';

@Injectable()
export class InvestmentEventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly core: InvestmentCoreService,
  ) {}

  async listTermEvents(termId: string, query: ListTermEventsQueryDto) {
    console.log('0 ja');
    await this.core.assertTermExists(termId);
    console.log('1 ja');
    const targetWeek = query.weekNo ?? (await this.core.getCurrentWeek(termId));
    const includeUpcoming = query.includeUpcoming ?? false;
    const statuses = this.resolveStatuses(query.statuses);
    const sort = query.sort ?? 'asc';
    const limit = query.limit;

    const where: Prisma.TermEventWhereInput = {
      termId,
      status: { in: statuses },
      ...(includeUpcoming
        ? { endWeek: { gte: targetWeek } }
        : {
            startWeek: { lte: targetWeek },
            endWeek: { gte: targetWeek },
          }),
    };

    const data = await this.prisma.termEvent.findMany({
      where,
      include: { event: true },
      orderBy: [{ startWeek: sort }, { createdAt: sort }],
      ...(limit ? { take: limit } : {}),
    });

    return {
      success: true,
      data,
      meta: {
        weekNo: targetWeek,
        includeUpcoming,
        statuses,
      },
    };
  }

  async listActiveEvents(termId: string, weekNo?: string) {
    const parsedWeek = this.parseWeekNo(weekNo);
    return this.listTermEvents(termId, {
      weekNo: parsedWeek,
      includeUpcoming: false,
      statuses: `${TermEventStatus.SCHEDULED},${TermEventStatus.ACTIVE}`,
    });
  }

  private parseWeekNo(weekNo?: string) {
    if (!weekNo) {
      return undefined;
    }

    const parsed = Number(weekNo);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new BadRequestException('weekNo must be a positive integer');
    }

    return parsed;
  }

  private resolveStatuses(raw?: string): TermEventStatus[] {
    const defaultStatuses = [TermEventStatus.SCHEDULED, TermEventStatus.ACTIVE];

    if (!raw || raw.trim().length === 0) {
      return defaultStatuses;
    }

    const normalized = this.core.normalizeStringArray(raw);
    if (!normalized.length) {
      return defaultStatuses;
    }

    const statusValues = new Set(Object.values(TermEventStatus));
    const statuses = normalized.map((item) => item as TermEventStatus);
    const invalid = statuses.filter((item) => !statusValues.has(item));

    if (invalid.length) {
      throw new BadRequestException(`Invalid statuses: ${invalid.join(', ')}`);
    }

    return statuses;
  }
}
