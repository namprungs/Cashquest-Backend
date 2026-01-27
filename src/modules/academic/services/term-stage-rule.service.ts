import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateTermStageRuleDto } from '../dto/term-stage-rule/create-term-stage-rule.dto';
import { UpdateTermStageRuleDto } from '../dto/term-stage-rule/update-term-stage-rule.dto';

@Injectable()
export class TermStageRuleService {
  constructor(private readonly prisma: PrismaService) {}

  private handleError(error: unknown): never {
    if (error instanceof HttpException) throw error;

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        throw new BadRequestException({
          success: false,
          message: 'Duplicate value (unique constraint)',
          meta: error.meta,
        });
      }
      if (error.code === 'P2025') {
        throw new NotFoundException({
          success: false,
          message: 'Record not found',
        });
      }
    }

    throw new InternalServerErrorException({
      success: false,
      message: 'Database connection failed or Internal Server Error',
      originalError: (error as any)?.message,
    });
  }

  private async assertTerm(termId: string) {
    const term = await this.prisma.term.findUnique({
      where: { id: termId },
      select: { id: true, totalWeeks: true },
    });
    if (!term) {
      throw new NotFoundException({
        success: false,
        message: `Term with ID ${termId} not found`,
      });
    }
    return term;
  }

  private async assertLifeStage(lifeStageId: string) {
    const ls = await this.prisma.lifeStage.findUnique({
      where: { id: lifeStageId },
      select: { id: true },
    });
    if (!ls) {
      throw new NotFoundException({
        success: false,
        message: `LifeStage with ID ${lifeStageId} not found`,
      });
    }
  }

  private validateWeekRange(
    startWeek: number,
    endWeek: number,
    totalWeeks: number,
  ) {
    if (startWeek < 1) throw new BadRequestException('startWeek must be >= 1');
    if (endWeek < 1) throw new BadRequestException('endWeek must be >= 1');
    if (startWeek > endWeek)
      throw new BadRequestException('startWeek must be <= endWeek');
    if (endWeek > totalWeeks) {
      throw new BadRequestException(
        `endWeek must be <= term.totalWeeks (${totalWeeks})`,
      );
    }
  }

  /**
   * overlap definition:
   * [a,b] overlaps [c,d] if a <= d AND c <= b
   */
  private async assertNoOverlap(
    termId: string,
    startWeek: number,
    endWeek: number,
    excludeRuleId?: string,
  ) {
    const conflict = await this.prisma.termStageRule.findFirst({
      where: {
        termId,
        ...(excludeRuleId ? { id: { not: excludeRuleId } } : {}),
        AND: [{ startWeek: { lte: endWeek } }, { endWeek: { gte: startWeek } }],
      },
      select: { id: true, startWeek: true, endWeek: true },
    });

    if (conflict) {
      throw new BadRequestException({
        success: false,
        message: `Stage rule overlaps with existing rule (${conflict.startWeek}-${conflict.endWeek})`,
        conflictRuleId: conflict.id,
      });
    }
  }

  async create(termId: string, dto: CreateTermStageRuleDto) {
    try {
      const startWeek = dto.startWeek ?? 1;

      const term = await this.assertTerm(termId);
      await this.assertLifeStage(dto.lifeStageId);

      this.validateWeekRange(startWeek, dto.endWeek, term.totalWeeks);
      await this.assertNoOverlap(termId, startWeek, dto.endWeek);

      const created = await this.prisma.termStageRule.create({
        data: {
          termId,
          lifeStageId: dto.lifeStageId,
          startWeek,
          endWeek: dto.endWeek,
        },
      });

      return { success: true, data: created };
    } catch (e) {
      this.handleError(e);
    }
  }

  async findByTerm(termId: string) {
    try {
      await this.assertTerm(termId);

      const rules = await this.prisma.termStageRule.findMany({
        where: { termId },
        include: { lifeStage: true },
        orderBy: [{ startWeek: 'asc' }, { endWeek: 'asc' }],
      });

      return { success: true, data: rules };
    } catch (e) {
      this.handleError(e);
    }
  }

  async update(ruleId: string, dto: UpdateTermStageRuleDto) {
    try {
      const existing = await this.prisma.termStageRule.findUnique({
        where: { id: ruleId },
        select: {
          id: true,
          termId: true,
          startWeek: true,
          endWeek: true,
          lifeStageId: true,
        },
      });
      if (!existing) {
        throw new NotFoundException({
          success: false,
          message: `Rule with ID ${ruleId} not found`,
        });
      }

      const term = await this.assertTerm(existing.termId);

      const nextStart = dto.startWeek ?? existing.startWeek;
      const nextEnd = dto.endWeek ?? existing.endWeek;
      const nextLifeStageId = dto.lifeStageId ?? existing.lifeStageId;

      await this.assertLifeStage(nextLifeStageId);
      this.validateWeekRange(nextStart, nextEnd, term.totalWeeks);
      await this.assertNoOverlap(existing.termId, nextStart, nextEnd, ruleId);

      const updated = await this.prisma.termStageRule.update({
        where: { id: ruleId },
        data: {
          ...(dto.lifeStageId !== undefined
            ? { lifeStageId: dto.lifeStageId }
            : {}),
          ...(dto.startWeek !== undefined ? { startWeek: dto.startWeek } : {}),
          ...(dto.endWeek !== undefined ? { endWeek: dto.endWeek } : {}),
        },
      });

      return { success: true, data: updated };
    } catch (e) {
      this.handleError(e);
    }
  }

  async remove(ruleId: string) {
    try {
      await this.prisma.termStageRule.delete({ where: { id: ruleId } });
      return { success: true, data: { id: ruleId } };
    } catch (e) {
      this.handleError(e);
    }
  }
}
