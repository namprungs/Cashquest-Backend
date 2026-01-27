import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class AcademicRuleResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async getActiveLifeStage(termId: string, weekNo: number) {
    if (!weekNo || weekNo < 1) {
      throw new BadRequestException('weekNo must be >= 1');
    }

    const term = await this.prisma.term.findUnique({
      where: { id: termId },
      select: { id: true, totalWeeks: true },
    });
    if (!term) throw new NotFoundException(`Term with ID ${termId} not found`);
    if (weekNo > term.totalWeeks) {
      throw new BadRequestException(
        `weekNo must be <= term.totalWeeks (${term.totalWeeks})`,
      );
    }

    const rule = await this.prisma.termStageRule.findFirst({
      where: {
        termId,
        startWeek: { lte: weekNo },
        endWeek: { gte: weekNo },
      },
      include: { lifeStage: true },
    });

    if (!rule) {
      // จะ throw หรือจะคืน null ก็ได้ แล้วแต่ policy
      throw new NotFoundException(
        `No TermStageRule matched for weekNo=${weekNo}`,
      );
    }

    return {
      success: true,
      data: {
        weekNo,
        lifeStage: rule.lifeStage,
        matchedRule: {
          id: rule.id,
          startWeek: rule.startWeek,
          endWeek: rule.endWeek,
        },
      },
    };
  }
}
