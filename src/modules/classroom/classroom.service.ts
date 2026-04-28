import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { QuestStatus, QuestSubmissionStatus } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { PlayerService } from 'src/modules/player/services/studentProfile.service';
import { QuestService } from '../quest/quest.service';

@Injectable()
export class ClassroomService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly playerService: PlayerService,
    private readonly questService: QuestService,
  ) {}

  private toNumber(value: unknown): number {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    if (
      typeof value === 'object' &&
      value !== null &&
      'toNumber' in value &&
      typeof (value as { toNumber: unknown }).toNumber === 'function'
    ) {
      const parsed = (value as { toNumber: () => number }).toNumber();
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  }

  private round2(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private async getCurrentWeekNo(termId: string) {
    const term = await this.prisma.term.findUnique({
      where: { id: termId },
      select: { startDate: true, totalWeeks: true },
    });
    if (!term) return null;

    const now = new Date();
    const termWeek = await this.prisma.termWeek.findFirst({
      where: {
        termId,
        startDate: { lte: now },
        endDate: { gte: now },
      },
      select: { weekNo: true },
    });
    if (termWeek) return termWeek.weekNo;

    const diffDays = Math.floor(
      (now.getTime() - term.startDate.getTime()) / (1000 * 60 * 60 * 24),
    );
    return Math.min(Math.max(Math.floor(diffDays / 7) + 1, 1), term.totalWeeks);
  }

  private async getLatestPriceByProduct(termId: string, productIds: string[]) {
    if (!productIds.length) return new Map<string, number>();

    const latestPrices = await this.prisma.productPrice.findMany({
      where: { termId, productId: { in: productIds } },
      orderBy: [{ weekNo: 'desc' }, { createdAt: 'desc' }],
      select: { productId: true, close: true },
    });

    const priceByProduct = new Map<string, number>();
    for (const price of latestPrices) {
      if (!priceByProduct.has(price.productId)) {
        priceByProduct.set(price.productId, this.toNumber(price.close));
      }
    }

    return priceByProduct;
  }

  private splitAssetType(type: string) {
    if (type === 'FUND') return 'funds';
    if (type === 'BOND') return 'bonds';
    return 'stocks';
  }

  // -----------------------------
  // Create classroom
  // -----------------------------
  async createClassroom(termId: string, teacherId: string, name: string) {
    // 1. ตรวจว่า term มีจริง
    const term = await this.prisma.term.findUnique({
      where: { id: termId },
      select: { id: true, schoolId: true },
    });
    if (!term) throw new NotFoundException('Term not found');

    // 2. ตรวจว่า teacher อยู่ school เดียวกับ term
    const teacher = await this.prisma.user.findUnique({
      where: { id: teacherId },
      select: { schoolId: true },
    });
    if (!teacher || teacher.schoolId !== term.schoolId) {
      throw new BadRequestException('Teacher does not belong to this school');
    }

    const classroom = await this.prisma.classroom.create({
      data: {
        name,
        termId,
        teacherId,
      },
    });

    return { success: true, data: classroom };
  }

  // -----------------------------
  // List classrooms in term
  // -----------------------------
  async findByTerm(termId: string) {
    const classrooms = await this.prisma.classroom.findMany({
      where: { termId },
      include: {
        teacher: { select: { id: true, username: true } },
        _count: { select: { students: true } },
      },
    });

    return { success: true, data: classrooms };
  }

  // -----------------------------
  // Teacher home dashboard
  // -----------------------------
  async getTeacherDashboard(termId: string, teacherId: string) {
    const term = await this.prisma.term.findUnique({
      where: { id: termId },
      select: { id: true },
    });

    if (!term) {
      throw new NotFoundException('Term not found');
    }

    const classrooms = await this.prisma.classroom.findMany({
      where: {
        termId,
        teacherId,
      },
      select: {
        id: true,
        name: true,
        students: {
          select: {
            studentId: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    if (!classrooms.length) {
      return {
        success: true,
        data: {
          summary: {
            classrooms: 0,
            students: 0,
            missions: 0,
          },
          classrooms: [],
        },
      };
    }

    const classroomIds = classrooms.map((c) => c.id);
    const allStudentIds = Array.from(
      new Set(classrooms.flatMap((c) => c.students.map((s) => s.studentId))),
    );

    const questAssignments = await this.prisma.questClassroom.findMany({
      where: {
        classroomId: { in: classroomIds },
        quest: {
          termId,
          status: QuestStatus.PUBLISHED,
        },
      },
      select: {
        classroomId: true,
        questId: true,
      },
    });

    const allQuestIds = Array.from(
      new Set(questAssignments.map((q) => q.questId)),
    );

    const profiles = allStudentIds.length
      ? await this.prisma.studentProfile.findMany({
          where: {
            termId,
            userId: { in: allStudentIds },
          },
          select: {
            id: true,
            userId: true,
            mainWallet: {
              select: {
                balance: true,
              },
            },
          },
        })
      : [];

    const profileIdByUserId = new Map<string, string>();
    const balanceByUserId = new Map<string, number>();
    for (const profile of profiles) {
      profileIdByUserId.set(profile.userId, profile.id);
      balanceByUserId.set(
        profile.userId,
        Number(profile.mainWallet?.balance ?? 0),
      );
    }

    const allProfileIds = profiles.map((p) => p.id);
    const approvedSubmissions =
      allQuestIds.length && allProfileIds.length
        ? await this.prisma.questSubmission.findMany({
            where: {
              status: QuestSubmissionStatus.APPROVED,
              questId: { in: allQuestIds },
              studentProfileId: { in: allProfileIds },
            },
            select: {
              questId: true,
              studentProfileId: true,
            },
          })
        : [];

    const approvedPairSet = new Set(
      approvedSubmissions.map((s) => `${s.questId}:${s.studentProfileId}`),
    );

    const questsByClassroom = new Map<string, Set<string>>();
    for (const row of questAssignments) {
      if (!questsByClassroom.has(row.classroomId)) {
        questsByClassroom.set(row.classroomId, new Set<string>());
      }
      questsByClassroom.get(row.classroomId)!.add(row.questId);
    }

    const classroomCards = classrooms.map((classroom) => {
      const studentIds = classroom.students.map((s) => s.studentId);
      const studentCount = studentIds.length;

      const questIds = questsByClassroom.get(classroom.id) ?? new Set<string>();
      const missionCount = questIds.size;

      const totalMoney = studentIds.reduce((sum, studentId) => {
        return sum + (balanceByUserId.get(studentId) ?? 0);
      }, 0);

      const avgMoney =
        studentCount > 0 ? Math.round(totalMoney / studentCount) : 0;

      let approvedCount = 0;
      for (const studentId of studentIds) {
        const profileId = profileIdByUserId.get(studentId);
        if (!profileId) {
          continue;
        }

        for (const questId of questIds) {
          if (approvedPairSet.has(`${questId}:${profileId}`)) {
            approvedCount += 1;
          }
        }
      }

      const expectedSubmissions = studentCount * missionCount;
      const percent =
        expectedSubmissions > 0
          ? Math.round((approvedCount / expectedSubmissions) * 100)
          : 0;

      return {
        classroomId: classroom.id,
        roomName: classroom.name,
        students: studentCount,
        missions: missionCount,
        avgMoney,
        percent,
      };
    });

    return {
      success: true,
      data: {
        summary: {
          classrooms: classrooms.length,
          students: allStudentIds.length,
          missions: allQuestIds.length,
        },
        classrooms: classroomCards,
      },
    };
  }

  // -----------------------------
  // Add student to classroom
  // -----------------------------
  async addStudent(classroomId: string, studentId: string) {
    const classroom = await this.prisma.classroom.findUnique({
      where: { id: classroomId },
      select: { id: true, termId: true, term: { select: { schoolId: true } } },
    });
    if (!classroom) throw new NotFoundException('Classroom not found');

    const student = await this.prisma.user.findUnique({
      where: { id: studentId },
      select: { schoolId: true },
    });
    if (!student || student.schoolId !== classroom.term.schoolId) {
      throw new BadRequestException('Student does not belong to this school');
    }

    try {
      // Bootstrap StudentProfile + Wallet (idempotent)
      await this.playerService.bootstrap(classroom.termId, studentId);

      const record = await this.prisma.classroomStudent.create({
        data: {
          classroomId,
          studentId,
        },
      });
      return { success: true, data: record };
    } catch (err) {
      console.log(err);
      throw new BadRequestException('Student already in classroom');
    }
  }

  // -----------------------------
  // Remove student
  // -----------------------------
  async removeStudent(classroomId: string, studentId: string) {
    await this.prisma.classroomStudent.delete({
      where: {
        classroomId_studentId: {
          classroomId,
          studentId,
        },
      },
    });

    return { success: true };
  }

  // -----------------------------
  // List students in classroom
  // -----------------------------
  async listStudents(classroomId: string) {
    const students = await this.prisma.classroomStudent.findMany({
      where: { classroomId },
      include: {
        student: {
          select: {
            id: true,
            username: true,
            email: true,
          },
        },
      },
    });

    return { success: true, data: students };
  }

  async getStudentOverview(classroomId: string) {
    const classroom = await this.prisma.classroom.findUnique({
      where: { id: classroomId },
      select: {
        id: true,
        name: true,
        termId: true,
        students: {
          select: {
            studentId: true,
            student: { select: { id: true, username: true, email: true } },
          },
        },
      },
    });

    if (!classroom) {
      throw new NotFoundException('Classroom not found');
    }

    const studentIds = classroom.students.map((row) => row.studentId);
    const profiles = studentIds.length
      ? await this.prisma.studentProfile.findMany({
          where: { termId: classroom.termId, userId: { in: studentIds } },
          select: {
            id: true,
            userId: true,
            mainWallet: { select: { balance: true } },
            investmentWallet: { select: { balance: true } },
            savingsAccounts: {
              where: { status: 'ACTIVE' },
              select: { balance: true },
            },
            fixedDeposits: {
              where: { status: 'ACTIVE' },
              select: { principal: true },
            },
            holdings: {
              where: { termId: classroom.termId, units: { gt: 0 } },
              select: {
                productId: true,
                units: true,
                avgCost: true,
              },
            },
          },
        })
      : [];

    const productIds = Array.from(
      new Set(
        profiles.flatMap((profile) =>
          profile.holdings.map((holding) => holding.productId),
        ),
      ),
    );
    const latestPriceByProduct = await this.getLatestPriceByProduct(
      classroom.termId,
      productIds,
    );

    const questIds = (
      await this.prisma.questClassroom.findMany({
        where: {
          classroomId,
          quest: { termId: classroom.termId, status: QuestStatus.PUBLISHED },
        },
        select: { questId: true },
      })
    ).map((row) => row.questId);

    const submissions =
      profiles.length && questIds.length
        ? await this.prisma.questSubmission.findMany({
            where: {
              studentProfileId: { in: profiles.map((profile) => profile.id) },
              questId: { in: questIds },
              status: QuestSubmissionStatus.APPROVED,
            },
            select: { studentProfileId: true },
          })
        : [];

    const missionsByProfileId = new Map<string, number>();
    for (const submission of submissions) {
      missionsByProfileId.set(
        submission.studentProfileId,
        (missionsByProfileId.get(submission.studentProfileId) ?? 0) + 1,
      );
    }

    const profileByUserId = new Map(
      profiles.map((profile) => [profile.userId, profile]),
    );
    const rows = classroom.students.map((row) => {
      const profile = profileByUserId.get(row.studentId);
      const wallet = this.toNumber(profile?.mainWallet?.balance);
      const savings = (profile?.savingsAccounts ?? []).reduce(
        (sum, account) => sum + this.toNumber(account.balance),
        0,
      );
      const fixedDeposit = (profile?.fixedDeposits ?? []).reduce(
        (sum, deposit) => sum + this.toNumber(deposit.principal),
        0,
      );
      const investmentCash = this.toNumber(profile?.investmentWallet?.balance);

      let marketValue = 0;
      let investedValue = 0;
      for (const holding of profile?.holdings ?? []) {
        const units = this.toNumber(holding.units);
        const avgCost = this.toNumber(holding.avgCost);
        const price = latestPriceByProduct.get(holding.productId) ?? avgCost;
        investedValue += units * avgCost;
        marketValue += units * price;
      }

      const totalCoin =
        wallet + savings + fixedDeposit + investmentCash + marketValue;
      const growth =
        investedValue > 0
          ? ((marketValue - investedValue) / investedValue) * 100
          : 0;

      return {
        id: row.student.id,
        studentProfileId: profile?.id ?? null,
        name: row.student.username,
        studentCode: row.student.username,
        email: row.student.email,
        classroomId: classroom.id,
        classroomName: classroom.name,
        rank: 0,
        missions: profile ? (missionsByProfileId.get(profile.id) ?? 0) : 0,
        walletBalance: this.round2(wallet),
        totalCoin: this.round2(totalCoin),
        growth: this.round2(growth),
      };
    });

    const sortedRows = [...rows].sort((a, b) => b.totalCoin - a.totalCoin);
    sortedRows.forEach((row, index) => {
      row.rank = index + 1;
    });

    const studentCount = sortedRows.length;
    const totalWallet = sortedRows.reduce(
      (sum, row) => sum + row.walletBalance,
      0,
    );
    const totalAssets = sortedRows.reduce((sum, row) => sum + row.totalCoin, 0);
    const totalGrowth = sortedRows.reduce((sum, row) => sum + row.growth, 0);

    return {
      success: true,
      data: {
        classroom: {
          id: classroom.id,
          name: classroom.name,
          termId: classroom.termId,
        },
        summary: {
          avgMoney: studentCount ? this.round2(totalWallet / studentCount) : 0,
          avgAssetValue: studentCount
            ? this.round2(totalAssets / studentCount)
            : 0,
          growthRate: studentCount
            ? this.round2(totalGrowth / studentCount)
            : 0,
        },
        students: sortedRows,
      },
    };
  }

  async getStudentDetail(classroomId: string, studentId: string) {
    const classroom = await this.prisma.classroom.findUnique({
      where: { id: classroomId },
      select: { id: true, name: true, termId: true },
    });
    if (!classroom) throw new NotFoundException('Classroom not found');

    const enrollment = await this.prisma.classroomStudent.findUnique({
      where: { classroomId_studentId: { classroomId, studentId } },
      select: {
        student: { select: { id: true, username: true, email: true } },
      },
    });
    if (!enrollment) {
      throw new NotFoundException('Student not found in this classroom');
    }

    const profile = await this.prisma.studentProfile.findUnique({
      where: {
        userId_termId: {
          userId: studentId,
          termId: classroom.termId,
        },
      },
      select: {
        id: true,
        mainWallet: { select: { balance: true } },
        investmentWallet: { select: { balance: true } },
        savingsAccounts: {
          where: { status: 'ACTIVE' },
          select: { balance: true },
        },
        fixedDeposits: {
          where: { status: 'ACTIVE' },
          select: { principal: true },
        },
        retirementGoals: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            currentAmount: true,
            targetAmount: true,
            retirementAge: true,
            lifeExpectancy: true,
          },
        },
        holdings: {
          where: { termId: classroom.termId, units: { gt: 0 } },
          include: { product: true },
          orderBy: { updatedAt: 'desc' },
        },
      },
    });

    const currentWeekNo = await this.getCurrentWeekNo(classroom.termId);
    const lifeStageRule =
      currentWeekNo == null
        ? null
        : await this.prisma.termStageRule.findFirst({
            where: {
              termId: classroom.termId,
              startWeek: { lte: currentWeekNo },
              endWeek: { gte: currentWeekNo },
            },
            include: { lifeStage: true },
          });

    const profileId = profile?.id;
    const productIds = (profile?.holdings ?? []).map(
      (holding) => holding.productId,
    );
    const latestPriceByProduct = await this.getLatestPriceByProduct(
      classroom.termId,
      productIds,
    );

    const assets = {
      stocks: [] as Array<Record<string, unknown>>,
      funds: [] as Array<Record<string, unknown>>,
      bonds: [] as Array<Record<string, unknown>>,
    };

    let marketValue = 0;
    let investedValue = 0;
    for (const holding of profile?.holdings ?? []) {
      const units = this.toNumber(holding.units);
      const avgCost = this.toNumber(holding.avgCost);
      const price = latestPriceByProduct.get(holding.productId) ?? avgCost;
      const valueCoin = units * price;
      const costValue = units * avgCost;
      const changeCoin = valueCoin - costValue;
      const changePercent = costValue > 0 ? (changeCoin / costValue) * 100 : 0;

      marketValue += valueCoin;
      investedValue += costValue;

      const bucket = this.splitAssetType(holding.product.type);
      assets[bucket].push({
        productId: holding.productId,
        symbol: holding.product.symbol,
        name: holding.product.name,
        units,
        unitsLabel:
          holding.product.type === 'STOCK'
            ? `จำนวนหุ้น: ${this.round2(units)}`
            : `จำนวนหน่วย: ${this.round2(units)}`,
        valueCoin: this.round2(valueCoin),
        changePercent: this.round2(changePercent),
        changeCoin: this.round2(changeCoin),
      });
    }

    const wallet = this.toNumber(profile?.mainWallet?.balance);
    const savings = (profile?.savingsAccounts ?? []).reduce(
      (sum, account) => sum + this.toNumber(account.balance),
      0,
    );
    const fixedDeposit = (profile?.fixedDeposits ?? []).reduce(
      (sum, deposit) => sum + this.toNumber(deposit.principal),
      0,
    );
    const investmentCash = this.toNumber(profile?.investmentWallet?.balance);
    const totalCoin =
      wallet + savings + fixedDeposit + investmentCash + marketValue;
    const growth =
      investedValue > 0
        ? ((marketValue - investedValue) / investedValue) * 100
        : 0;

    const questRows = await this.prisma.quest.findMany({
      where: {
        termId: classroom.termId,
        status: QuestStatus.PUBLISHED,
        classrooms: { some: { classroomId } },
      },
      select: {
        id: true,
        title: true,
        description: true,
        isSystem: true,
        rewardCoins: true,
        difficulty: true,
        deadlineAt: true,
        submissions: profileId
          ? {
              where: { studentProfileId: profileId },
              select: { id: true, status: true, updatedAt: true },
              take: 1,
            }
          : false,
      },
      orderBy: [{ parentId: 'asc' }, { orderNo: 'asc' }, { createdAt: 'desc' }],
    });

    const badgeRows = profileId
      ? await this.prisma.badge.findMany({
          where: { termId: classroom.termId },
          orderBy: { code: 'asc' },
          include: {
            studentBadges: {
              where: { studentProfileId: profileId },
              select: { earnedAt: true },
              take: 1,
            },
          },
        })
      : [];

    const retirementGoal = profile?.retirementGoals[0];

    return {
      success: true,
      data: {
        profile: {
          id: enrollment.student.id,
          studentProfileId: profile?.id ?? null,
          displayName: enrollment.student.username,
          studentCode: enrollment.student.username,
          email: enrollment.student.email,
          classroomId: classroom.id,
          classroomName: classroom.name,
          termId: classroom.termId,
          currentWeekNo,
          lifeStage: lifeStageRule?.lifeStage ?? null,
          totalCoin: this.round2(totalCoin),
        },
        finance: {
          accountMoney: this.round2(wallet),
          assetValue: this.round2(totalCoin),
          growthRate: this.round2(growth),
          savings: this.round2(savings),
          fixedDeposit: this.round2(fixedDeposit),
          investmentCash: this.round2(investmentCash),
          investmentMarketValue: this.round2(marketValue),
        },
        retirementGoal: retirementGoal
          ? {
              id: retirementGoal.id,
              currentAmount: this.round2(
                this.toNumber(retirementGoal.currentAmount),
              ),
              targetAmount: this.round2(
                this.toNumber(retirementGoal.targetAmount),
              ),
              retirementAge: retirementGoal.retirementAge,
              lifeExpectancy: retirementGoal.lifeExpectancy,
            }
          : null,
        badges: badgeRows.map((badge) => {
          const earned = badge.studentBadges[0];
          return {
            id: badge.id,
            code: badge.code,
            title: badge.name,
            description: badge.description,
            earned: Boolean(earned),
            earnedAt: earned?.earnedAt ?? null,
          };
        }),
        quests: questRows.map((quest) => {
          const submission = quest.submissions?.[0];
          return {
            id: quest.id,
            title: quest.title,
            description: quest.description,
            isSystem: quest.isSystem,
            rewardCoins: quest.rewardCoins,
            difficulty: quest.difficulty,
            deadlineAt: quest.deadlineAt,
            status: submission?.status ?? 'NOT_SUBMITTED',
            submissionId: submission?.id ?? null,
            submittedAt: submission?.updatedAt ?? null,
          };
        }),
        assets,
      },
    };
  }

  // -----------------------------
  // Home overview for classroom
  // -----------------------------
  async getHomeOverview(classroomId: string) {
    const classroom = await this.prisma.classroom.findUnique({
      where: { id: classroomId },
      include: { students: { select: { studentId: true } }, term: true },
    });
    if (!classroom) {
      throw new NotFoundException('Classroom not found');
    }

    const studentIds = classroom.students.map((s) => s.studentId);

    // total_students
    const total_students = studentIds.length;

    // active_missions
    const active_missions = await this.prisma.questClassroom.count({
      where: {
        classroomId,
        quest: { status: QuestStatus.PUBLISHED },
      },
    });

    // avg_balance_per_student
    const profiles = await this.prisma.studentProfile.findMany({
      where: {
        userId: { in: studentIds },
        termId: classroom.termId,
      },
      select: {
        mainWallet: { select: { balance: true } },
      },
    });

    const total_balance = profiles.reduce(
      (sum, p) => sum + Number(p.mainWallet?.balance || 0),
      0,
    );
    const avg_balance_per_student =
      total_students > 0 ? total_balance / total_students : 0;

    // pending_tasks
    const pending_tasks =
      await this.questService.getPendingSubmissionsForClassroom(classroomId, 2);

    // leaderboard
    const leaderboardData = await this.prisma.studentProfile.findMany({
      where: {
        userId: { in: studentIds },
        termId: classroom.termId,
      },
      select: {
        user: { select: { username: true } },
        mainWallet: { select: { balance: true } },
      },
      orderBy: { mainWallet: { balance: 'desc' } },
      take: 10,
    });

    let rank = 1;
    const leaderboard = leaderboardData.map((p, index) => {
      if (
        index > 0 &&
        Number(p.mainWallet?.balance) ===
          Number(leaderboardData[index - 1].mainWallet?.balance)
      ) {
        // same balance, same rank
      } else {
        rank = index + 1;
      }
      return {
        rank,
        name: p.user.username,
        total_coin: Number(p.mainWallet?.balance || 0),
        change_pct: 0, // placeholder
      };
    });

    return {
      summary: {
        total_students,
        active_missions,
        avg_balance_per_student:
          Math.round(avg_balance_per_student * 100) / 100,
      },
      pending_tasks,
      leaderboard,
    };
  }

  async getPendingSubmissions(classroomId: string, limit: number = 50) {
    return {
      success: true,
      data: await this.questService.getPendingSubmissionsForClassroom(
        classroomId,
        limit,
      ),
    };
  }
}
