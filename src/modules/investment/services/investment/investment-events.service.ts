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
    await this.core.assertTermExists(termId);

    const targetWeek = query.weekNo ?? (await this.core.getCurrentWeek(termId));
    const includeUpcoming = query.includeUpcoming ?? false;
    const includePast = query.includePast ?? false;
    const publishedOnly = query.publishedOnly === true;
    const statuses = this.resolveStatuses(query.statuses, publishedOnly);
    const sort = query.sort ?? 'asc';
    const limit = query.limit;

    const weekWindow = this.buildWeekWindow({
      targetWeek,
      includePast,
      includeUpcoming,
    });

    const where: Prisma.TermEventWhereInput = {
      termId,
      status: { in: statuses },
      ...weekWindow,
    };

    const data = await this.prisma.termEvent.findMany({
      where,
      include: { event: true },
      orderBy: [{ startWeek: sort }, { createdAt: sort }],
      ...(limit ? { take: limit } : {}),
    });

    const weekNos = Array.from(new Set(data.map((item) => item.startWeek)));
    const termWeeks = weekNos.length
      ? await this.prisma.termWeek.findMany({
          where: {
            termId,
            weekNo: { in: weekNos },
          },
          select: {
            weekNo: true,
            startDate: true,
            endDate: true,
          },
        })
      : [];
    const weekByNo = new Map(termWeeks.map((week) => [week.weekNo, week]));

    return {
      success: true,
      data: data.map((item) => {
        const startWeek = weekByNo.get(item.startWeek);
        return {
          ...item,
          startWeekStartDate: startWeek?.startDate ?? null,
          startWeekEndDate: startWeek?.endDate ?? null,
        };
      }),
      meta: {
        weekNo: targetWeek,
        includeUpcoming,
        includePast,
        publishedOnly,
        statuses,
      },
    };
  }

  async listActiveEvents(termId: string, weekNo?: string) {
    const parsedWeek = this.parseWeekNo(weekNo);
    return this.listTermEvents(termId, {
      weekNo: parsedWeek,
      includeUpcoming: false,
      includePast: false,
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

  private resolveStatuses(
    raw?: string,
    publishedOnly = false,
  ): TermEventStatus[] {
    const defaultStatuses = publishedOnly
      ? [TermEventStatus.ACTIVE, TermEventStatus.EXPIRED]
      : [TermEventStatus.SCHEDULED, TermEventStatus.ACTIVE];

    if (!raw || raw.trim().length === 0) {
      return defaultStatuses;
    }

    const normalized = this.core.normalizeStringArray(raw);
    if (!normalized.length) {
      return defaultStatuses;
    }

    const statusValues = new Set(Object.values(TermEventStatus));
    const aliases: Record<string, TermEventStatus> = {
      ANNOUNCED: TermEventStatus.ANNOUNCED,
      ACTIVE: TermEventStatus.ACTIVE,
      SCHEDULED: TermEventStatus.SCHEDULED,
      EXPIRE: TermEventStatus.EXPIRED,
    };

    const statuses = normalized.map((item) => {
      const key = item.toUpperCase();
      return aliases[key] ?? (key as TermEventStatus);
    });
    console.log('this is status', statuses);
    const invalid = statuses.filter((item) => !statusValues.has(item));

    if (invalid.length) {
      throw new BadRequestException(`Invalid statuses: ${invalid.join(', ')}`);
    }

    return statuses;
  }

  private buildWeekWindow(params: {
    targetWeek: number;
    includePast: boolean;
    includeUpcoming: boolean;
  }): Prisma.TermEventWhereInput {
    const { targetWeek, includePast, includeUpcoming } = params;

    if (includePast && includeUpcoming) {
      return {};
    }

    if (includePast) {
      return {
        startWeek: { lte: targetWeek },
      };
    }

    if (includeUpcoming) {
      return {
        endWeek: { gte: targetWeek },
      };
    }

    return {
      startWeek: { lte: targetWeek },
      endWeek: { gte: targetWeek },
    };
  }
}
