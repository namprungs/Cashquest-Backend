import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { User } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateLearningModuleDto } from './dto/create-learning-module.dto';
import { UpdateLearningModuleDto } from './dto/update-learning-module.dto';
import { ListLearningModulesQueryDto } from './dto/list-learning-modules-query.dto';
import { AppCacheService } from '../cache/app-cache.service';

type CurrentUser = User & { role?: { name?: string } | null };

@Injectable()
export class LearningModuleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: AppCacheService,
  ) {}

  private assertTeacherOrAdmin(user: CurrentUser) {
    const roleName = user?.role?.name?.toUpperCase?.();
    if (!roleName || !['TEACHER', 'ADMIN', 'SUPER_ADMIN'].includes(roleName)) {
      throw new ForbiddenException(
        'Only teacher/admin can perform this action',
      );
    }
  }

  private async assertTermExists(termId: string) {
    const term = await this.prisma.term.findUnique({
      where: { id: termId },
      select: { id: true },
    });
    if (!term) {
      throw new NotFoundException('Term not found');
    }
  }

  private async ensureOrderNoAvailable(
    termId: string,
    orderNo: number,
    excludeId?: string,
  ) {
    const duplicate = await this.prisma.learningModule.findFirst({
      where: {
        termId,
        orderNo,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });

    if (duplicate) {
      throw new BadRequestException(
        `orderNo ${orderNo} is already used in this term`,
      );
    }
  }

  async create(user: CurrentUser, dto: CreateLearningModuleDto) {
    this.assertTeacherOrAdmin(user);
    await this.assertTermExists(dto.termId);
    await this.ensureOrderNoAvailable(dto.termId, dto.orderNo);

    const created = await this.prisma.learningModule.create({
      data: {
        termId: dto.termId,
        title: dto.title,
        description: dto.description,
        contentUrl: dto.contentUrl,
        orderNo: dto.orderNo,
        isActive: dto.isActive ?? true,
      },
    });

    return { success: true, data: created };
  }

  async update(
    moduleId: string,
    user: CurrentUser,
    dto: UpdateLearningModuleDto,
  ) {
    this.assertTeacherOrAdmin(user);

    const existing = await this.prisma.learningModule.findUnique({
      where: { id: moduleId },
      select: { id: true, termId: true },
    });
    if (!existing) {
      throw new NotFoundException('Learning module not found');
    }

    const nextTermId = dto.termId ?? existing.termId;
    if (dto.termId) {
      await this.assertTermExists(dto.termId);
    }
    if (dto.orderNo !== undefined) {
      await this.ensureOrderNoAvailable(nextTermId, dto.orderNo, moduleId);
    }

    const updated = await this.prisma.learningModule.update({
      where: { id: moduleId },
      data: {
        ...(dto.termId ? { termId: dto.termId } : {}),
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
        ...(dto.contentUrl !== undefined ? { contentUrl: dto.contentUrl } : {}),
        ...(dto.orderNo !== undefined ? { orderNo: dto.orderNo } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });

    return { success: true, data: updated };
  }

  async remove(moduleId: string, user: CurrentUser) {
    this.assertTeacherOrAdmin(user);

    const existing = await this.prisma.learningModule.findUnique({
      where: { id: moduleId },
      select: {
        id: true,
        _count: {
          select: {
            quizzes: true,
            quests: true,
          },
        },
      },
    });
    if (!existing) {
      throw new NotFoundException('Learning module not found');
    }

    if (existing._count.quizzes > 0 || existing._count.quests > 0) {
      throw new BadRequestException(
        'Cannot delete module that is already referenced by quiz/quest',
      );
    }

    await this.prisma.learningModule.delete({ where: { id: moduleId } });
    return { success: true, data: { id: moduleId } };
  }

  async setActive(moduleId: string, user: CurrentUser, isActive: boolean) {
    this.assertTeacherOrAdmin(user);

    const module = await this.prisma.learningModule.findUnique({
      where: { id: moduleId },
      select: { id: true },
    });
    if (!module) {
      throw new NotFoundException('Learning module not found');
    }

    const updated = await this.prisma.learningModule.update({
      where: { id: moduleId },
      data: { isActive },
    });

    return { success: true, data: updated };
  }

  async list(query: ListLearningModulesQueryDto) {
    const key = `learning:list:${this.cache.stableKey(query)}`;
    return this.cache.getOrSetCache(key, 900, () =>
      this.fetchLearningModules(query),
    );
  }

  private async fetchLearningModules(query: ListLearningModulesQueryDto) {
    const isActiveFilter =
      query.isActive === 'true'
        ? true
        : query.isActive === 'false'
          ? false
          : undefined;

    const modules = await this.prisma.learningModule.findMany({
      where: {
        ...(query.termId ? { termId: query.termId } : {}),
        ...(isActiveFilter !== undefined ? { isActive: isActiveFilter } : {}),
        ...(query.search
          ? {
              OR: [
                { title: { contains: query.search, mode: 'insensitive' } },
                {
                  description: {
                    contains: query.search,
                    mode: 'insensitive',
                  },
                },
              ],
            }
          : {}),
      },
      orderBy: [{ orderNo: 'asc' }, { createdAt: 'asc' }],
    });

    return { success: true, data: modules };
  }

  async findOne(moduleId: string) {
    return this.cache.getOrSetCache(`learning:${moduleId}`, 900, () =>
      this.fetchLearningModule(moduleId),
    );
  }

  private async fetchLearningModule(moduleId: string) {
    const module = await this.prisma.learningModule.findUnique({
      where: { id: moduleId },
    });
    if (!module) {
      throw new NotFoundException('Learning module not found');
    }

    return { success: true, data: module };
  }
}
