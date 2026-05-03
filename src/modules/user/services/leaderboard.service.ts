import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { AppCacheService } from '../../cache/app-cache.service';

@Injectable()
export class LeaderboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: AppCacheService,
  ) {}

  async getClassroomLeaderboard(userId: string, termId: string, take: number) {
    return this.cache.getOrSetCache(
      `leaderboard:user:${userId}:term:${termId}:take:${take}`,
      90,
      () => this.fetchClassroomLeaderboard(userId, termId, take),
    );
  }

  private async fetchClassroomLeaderboard(
    userId: string,
    termId: string,
    take: number,
  ) {
    const enrollment = await this.prisma.classroomStudent.findFirst({
      where: {
        studentId: userId,
        classroom: { termId },
      },
      select: {
        classroomId: true,
      },
    });

    if (!enrollment) {
      return {
        success: true,
        data: [],
      };
    }

    const classroomStudents = await this.prisma.classroomStudent.findMany({
      where: { classroomId: enrollment.classroomId },
      select: {
        studentId: true,
      },
    });

    const studentUserIds = classroomStudents.map((cs) => cs.studentId);

    const profiles = await this.prisma.studentProfile.findMany({
      where: {
        userId: { in: studentUserIds },
        termId,
      },
      select: {
        user: { select: { username: true } },
        mainWallet: { select: { balance: true } },
      },
    });

    const ranked = profiles
      .map((p) => ({
        name: p.user.username,
        totalCoin: Number(p.mainWallet?.balance ?? 0),
      }))
      .sort((a, b) => b.totalCoin - a.totalCoin);

    let rank = 1;
    const leaderboard = ranked.slice(0, take).map((item, index) => {
      if (index > 0 && item.totalCoin === ranked[index - 1].totalCoin) {
        // same balance → same rank
      } else {
        rank = index + 1;
      }
      return {
        rank,
        name: item.name,
        totalCoin: item.totalCoin,
        changePct: 0,
      };
    });

    return {
      success: true,
      data: leaderboard,
    };
  }
}
