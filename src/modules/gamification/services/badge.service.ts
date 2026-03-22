import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateBadgeDto } from '../dto/create-badge.dto';
import { AwardStudentBadgeDto } from '../dto/award-student-badge.dto';
import { UpdateBadgeDto } from '../dto/update-badge.dto';

@Injectable()
export class BadgeService {
  constructor(private readonly prisma: PrismaService) {}

  private async ensureTermExists(termId: string) {
    const term = await this.prisma.term.findUnique({
      where: { id: termId },
      select: { id: true },
    });

    if (!term) {
      throw new NotFoundException('Term not found');
    }
  }

  async createBadge(termId: string, dto: CreateBadgeDto) {
    await this.ensureTermExists(termId);

    const badge = await this.prisma.badge.create({
      data: {
        termId,
        code: dto.code,
        name: dto.name,
        description: dto.description,
        ruleJson: dto.ruleJson as Prisma.InputJsonValue,
      },
    });

    return {
      success: true,
      data: badge,
      message: 'Badge created successfully',
    };
  }

  async getBadgesForAdmin(termId: string) {
    await this.ensureTermExists(termId);

    const badges = await this.prisma.badge.findMany({
      where: { termId },
      orderBy: { code: 'asc' },
    });

    return {
      success: true,
      data: badges,
      meta: {
        count: badges.length,
      },
    };
  }

  async getBadgesForStudent(termId: string, studentId: string, limit = 20) {
    await this.ensureTermExists(termId);

    const studentProfile = await this.prisma.studentProfile.findUnique({
      where: {
        userId_termId: {
          userId: studentId,
          termId,
        },
      },
      select: { id: true },
    });

    if (!studentProfile) {
      throw new NotFoundException('Student profile not found for this term');
    }

    const badges = await this.prisma.badge.findMany({
      where: { termId },
      orderBy: { code: 'asc' },
      include: {
        studentBadges: {
          where: { studentProfileId: studentProfile.id },
          select: { earnedAt: true },
          take: 1,
        },
      },
    });

    const sortedBadges = [...badges].sort((a, b) => {
      const aEarned = a.studentBadges.length > 0;
      const bEarned = b.studentBadges.length > 0;

      if (aEarned !== bEarned) {
        return aEarned ? -1 : 1;
      }

      return a.code.localeCompare(b.code);
    });

    const limitedBadges = sortedBadges.slice(0, limit);

    return {
      success: true,
      data: limitedBadges.map((badge) => {
        const earnedRecord = badge.studentBadges[0];

        return {
          id: badge.id,
          termId: badge.termId,
          code: badge.code,
          name: badge.name,
          description: badge.description,
          ruleJson: badge.ruleJson,
          earned: Boolean(earnedRecord),
          earnedAt: earnedRecord?.earnedAt ?? null,
        };
      }),
      meta: {
        limit,
        count: limitedBadges.length,
      },
    };
  }

  async getBadgeById(termId: string, badgeId: string, studentId: string) {
    await this.ensureTermExists(termId);

    const studentProfile = await this.prisma.studentProfile.findUnique({
      where: {
        userId_termId: {
          userId: studentId,
          termId,
        },
      },
      select: { id: true },
    });

    if (!studentProfile) {
      throw new NotFoundException('Student profile not found for this term');
    }

    const badge = await this.prisma.badge.findFirst({
      where: {
        id: badgeId,
        termId,
      },
      include: {
        studentBadges: {
          where: { studentProfileId: studentProfile.id },
          select: { earnedAt: true },
          take: 1,
        },
      },
    });

    if (!badge) {
      throw new NotFoundException('Badge not found');
    }

    const earnedRecord = badge.studentBadges[0];

    return {
      success: true,
      data: {
        id: badge.id,
        termId: badge.termId,
        code: badge.code,
        name: badge.name,
        description: badge.description,
        ruleJson: badge.ruleJson,
        earned: Boolean(earnedRecord),
        earnedAt: earnedRecord?.earnedAt ?? null,
      },
    };
  }

  async getBadgeByIdForAdmin(termId: string, badgeId: string) {
    await this.ensureTermExists(termId);

    const badge = await this.prisma.badge.findFirst({
      where: {
        id: badgeId,
        termId,
      },
    });

    if (!badge) {
      throw new NotFoundException('Badge not found');
    }

    return {
      success: true,
      data: badge,
    };
  }

  async updateBadge(termId: string, badgeId: string, dto: UpdateBadgeDto) {
    await this.ensureTermExists(termId);

    const existing = await this.prisma.badge.findFirst({
      where: {
        id: badgeId,
        termId,
      },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException('Badge not found');
    }

    const updated = await this.prisma.badge.update({
      where: { id: badgeId },
      data: {
        code: dto.code,
        name: dto.name,
        description: dto.description,
        ruleJson:
          dto.ruleJson === undefined
            ? undefined
            : (dto.ruleJson as Prisma.InputJsonValue),
      },
    });

    return {
      success: true,
      data: updated,
      message: 'Badge updated successfully',
    };
  }

  async deleteBadge(termId: string, badgeId: string) {
    await this.ensureTermExists(termId);

    const existing = await this.prisma.badge.findFirst({
      where: {
        id: badgeId,
        termId,
      },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException('Badge not found');
    }

    await this.prisma.badge.delete({
      where: { id: badgeId },
    });

    return {
      success: true,
      message: 'Badge deleted successfully',
    };
  }

  async awardBadgeToStudentProfile(
    termId: string,
    badgeId: string,
    dto: AwardStudentBadgeDto,
  ) {
    await this.ensureTermExists(termId);

    const badge = await this.prisma.badge.findFirst({
      where: {
        id: badgeId,
        termId,
      },
      select: {
        id: true,
        termId: true,
        code: true,
        name: true,
      },
    });

    if (!badge) {
      throw new NotFoundException('Badge not found');
    }

    const studentProfile = await this.prisma.studentProfile.findFirst({
      where: {
        id: dto.studentProfileId,
        termId,
      },
      select: {
        id: true,
        userId: true,
        termId: true,
      },
    });

    if (!studentProfile) {
      throw new NotFoundException('Student profile not found for this term');
    }

    const earnedAt = dto.earnedAt ? new Date(dto.earnedAt) : new Date();

    const studentBadge = await this.prisma.studentBadge.upsert({
      where: {
        studentProfileId_badgeId: {
          studentProfileId: studentProfile.id,
          badgeId: badge.id,
        },
      },
      create: {
        studentProfileId: studentProfile.id,
        badgeId: badge.id,
        earnedAt,
      },
      update: {
        earnedAt,
      },
    });

    return {
      success: true,
      message: 'Badge awarded to student profile successfully',
      data: {
        studentProfileId: studentBadge.studentProfileId,
        badgeId: studentBadge.badgeId,
        earnedAt: studentBadge.earnedAt,
        badge: {
          code: badge.code,
          name: badge.name,
        },
      },
    };
  }
}
