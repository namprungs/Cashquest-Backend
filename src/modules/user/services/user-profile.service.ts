import { Injectable, NotFoundException } from '@nestjs/common';
import { TermStatus } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { AppCacheService } from '../../cache/app-cache.service';

@Injectable()
export class UserProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: AppCacheService,
  ) {}

  async getMeProfile(userId: string, termId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        email: true,
        profileImageUrl: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const studentProfile = await this.prisma.studentProfile.findUnique({
      where: {
        userId_termId: {
          userId,
          termId,
        },
      },
      select: {
        id: true,
        termId: true,
        mainWallet: {
          select: {
            balance: true,
          },
        },
      },
    });

    const classroomEnrollment = await this.prisma.classroomStudent.findFirst({
      where: {
        studentId: userId,
        classroom: {
          termId,
        },
      },
      include: {
        classroom: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        joinedAt: 'desc',
      },
    });

    const term = await this.prisma.term.findUnique({
      where: { id: termId },
      select: {
        id: true,
        startDate: true,
        totalWeeks: true,
      },
    });

    let currentWeekNo: number | null = null;

    if (term) {
      const now = new Date();
      const termWeek = await this.prisma.termWeek.findFirst({
        where: {
          termId,
          startDate: { lte: now },
          endDate: { gte: now },
        },
        select: {
          weekNo: true,
        },
      });

      if (termWeek) {
        currentWeekNo = termWeek.weekNo;
      } else {
        const msPerDay = 1000 * 60 * 60 * 24;
        const diffDays = Math.floor(
          (now.getTime() - term.startDate.getTime()) / msPerDay,
        );
        const computedWeek = Math.floor(diffDays / 7) + 1;
        currentWeekNo = Math.min(Math.max(computedWeek, 1), term.totalWeeks);
      }
    }

    const activeStageRule =
      currentWeekNo === null
        ? null
        : await this.prisma.termStageRule.findFirst({
            where: {
              termId,
              startWeek: { lte: currentWeekNo },
              endWeek: { gte: currentWeekNo },
            },
            include: {
              lifeStage: {
                select: {
                  id: true,
                  name: true,
                  orderNo: true,
                  unlockInvestment: true,
                  enableRandomExpense: true,
                },
              },
            },
          });

    const profileId = studentProfile?.id;

    const [completedQuests, earnedBadges, portfolioFinance] = await Promise.all(
      [
        profileId
          ? this.prisma.questSubmission.count({
              where: {
                studentProfileId: profileId,
                status: 'APPROVED',
              },
            })
          : Promise.resolve(0),
        profileId
          ? this.prisma.studentBadge.count({
              where: {
                studentProfileId: profileId,
              },
            })
          : Promise.resolve(0),
        profileId
          ? this._getPortfolioGrowthPercent(profileId)
          : Promise.resolve(0),
      ],
    );

    return {
      success: true,
      data: {
        userId: user.id,
        displayName: user.username,
        studentCode: user.username,
        email: user.email,
        profileImageUrl: user.profileImageUrl,
        studentProfileId: profileId ?? null,
        walletBalance: studentProfile?.mainWallet?.balance ?? 0,
        termId,
        classroomName: classroomEnrollment?.classroom?.name ?? null,
        classroomId: classroomEnrollment?.classroom?.id ?? null,
        currentWeekNo,
        lifeStage: activeStageRule?.lifeStage ?? null,
        stats: {
          missionCompleted: completedQuests,
          achievementsCount: earnedBadges,
          portfolioGrowth: portfolioFinance,
        },
      },
    };
  }

  async updateMyProfileImage(userId: string, profileImageUrl: string | null) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { profileImageUrl },
      select: {
        id: true,
        username: true,
        email: true,
        profileImageUrl: true,
      },
    });

    const profiles = await this.prisma.studentProfile.findMany({
      where: { userId },
      select: { termId: true },
    });
    await Promise.all(
      profiles.map((profile) =>
        this.cache.delete(`user:profile:${userId}:term:${profile.termId}`),
      ),
    );

    return {
      success: true,
      data: user,
    };
  }

  async getMyCurrentTermId(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        schoolId: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.schoolId) {
      throw new NotFoundException('User is not assigned to a school');
    }

    const term = await this.prisma.term.findFirst({
      where: {
        schoolId: user.schoolId,
        status: TermStatus.ONGOING,
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (!term) {
      throw new NotFoundException('Active term not found');
    }

    return {
      success: true,
      data: {
        termId: term.id,
        termName: term.name,
      },
    };
  }

  private async _getPortfolioGrowthPercent(
    studentProfileId: string,
  ): Promise<number> {
    const profile = await this.prisma.studentProfile.findUnique({
      where: { id: studentProfileId },
      select: {
        mainWallet: { select: { id: true, balance: true } },
        investmentWallet: { select: { id: true, balance: true } },
      },
    });

    if (!profile) return 0;

    const walletBalance = Number(profile.mainWallet?.balance ?? 0);
    const investmentBalance = Number(profile.investmentWallet?.balance ?? 0);

    const [savingsSum, fdSum] = await Promise.all([
      this.prisma.savingsAccount.aggregate({
        where: {
          studentProfileId,
          status: 'ACTIVE',
        },
        _sum: { balance: true },
      }),
      this.prisma.fixedDeposit.aggregate({
        where: {
          studentProfileId,
          status: 'ACTIVE',
        },
        _sum: { principal: true },
      }),
    ]);

    const savingsBalance = Number(savingsSum._sum.balance ?? 0);
    const fdBalance = Number(fdSum._sum.principal ?? 0);
    const currentTotal =
      walletBalance + investmentBalance + savingsBalance + fdBalance;

    const monthStart = new Date(
      new Date().getFullYear(),
      new Date().getMonth(),
      1,
    );

    const mainWalletSnapshot = profile.mainWallet?.id
      ? await this.prisma.walletTransaction.findFirst({
          where: {
            walletId: profile.mainWallet.id,
            createdAt: { lt: monthStart },
          },
          orderBy: [{ createdAt: 'desc' }],
          select: { balanceAfter: true },
        })
      : null;

    const previousWallet = Number(
      mainWalletSnapshot?.balanceAfter ?? walletBalance,
    );

    const previousTotal = previousWallet + savingsBalance + fdBalance;

    if (previousTotal === 0) return 0;

    const growth = ((currentTotal - previousTotal) / previousTotal) * 100;
    return Math.round(growth * 100) / 100;
  }
}
