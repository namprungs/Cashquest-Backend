import { Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Prisma, TermStatus, User } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { RegisterUserDto } from './dto/register-user.dto';
import { AppCacheService } from '../cache/app-cache.service';

@Injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: AppCacheService,
  ) {}

  async create(createUserDto: CreateUserDto) {
    const salt = await bcrypt.genSalt();
    createUserDto.password = await bcrypt.hash(createUserDto.password, salt);

    const userExists = await this.prisma.user.findUnique({
      where: { email: createUserDto.email },
    });

    if (userExists) {
      throw new NotFoundException('User already exists');
    }

    const newUser: User = await this.prisma.user.create({
      data: createUserDto,
    });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _password, ...result } = newUser;
    return { data: result, message: 'User created successfully' };
  }

  async registerWithRole(dto: RegisterUserDto) {
    const salt = await bcrypt.genSalt();
    const hashed = await bcrypt.hash(dto.password, salt);

    const userExists = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (userExists) {
      throw new NotFoundException('User already exists');
    }

    const role = await this.prisma.role.findUnique({
      where: { id: dto.roleId },
    });
    if (!role) {
      throw new NotFoundException('Role not found');
    }

    if (dto.schoolId) {
      const school = await this.prisma.school.findUnique({
        where: { id: dto.schoolId },
      });
      if (!school) {
        throw new NotFoundException('School not found');
      }
    }
    console.log('schoolId', dto?.schoolId);
    const newUser = await this.prisma.user.create({
      data: {
        email: dto.email,
        username: dto.username,
        password: hashed,
        roleId: dto.roleId,
        schoolId: dto.schoolId,
      },
      select: {
        id: true,
        email: true,
        username: true,
        roleId: true,
        schoolId: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return { data: newUser, message: 'User registered with role successfully' };
  }

  async assignSchool(userId: string, schoolId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const school = await this.prisma.school.findUnique({
      where: { id: schoolId },
    });
    if (!school) {
      throw new NotFoundException('School not found');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { schoolId },
      select: {
        id: true,
        email: true,
        username: true,
        roleId: true,
        schoolId: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return { data: updated, message: 'User school assigned successfully' };
  }

  async getUser(params: Partial<User>): Promise<User> {
    const user = await this.prisma.user.findFirst({
      where: params,
    });
    if (!user) {
      throw new NotFoundException();
    }

    return user;
  }
  async getUserById(where: Prisma.UserWhereUniqueInput): Promise<User> {
    const user = await this.prisma.user.findUnique({
      where,
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async getUserWithRolePermissionById(id: string) {
    // ลบ : Promise<User> ออก หรือเปลี่ยนเป็น Promise<any> ชั่วคราว ถ้า Type มันฟ้องเรื่อง Relation
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        username: true,
        // 👇 เพิ่ม 3 ตัวนี้เข้าไปครับ
        roleId: true,
        isActive: true,
        schoolId: true,

        // role query เหมือนเดิม
        role: {
          select: {
            name: true,
            rolePermissions: {
              select: {
                permission: { select: { name: true } },
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException();
    }

    return user;
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        roleId: true,
        createdAt: true,
        updatedAt: true,
        role: {
          select: {
            name: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

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

    // ---- Stats for profile page ----
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

    // Compare with start of month
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

  async updateUser(query: Partial<User>, data: Partial<User>) {
    return await this.prisma.user.updateMany({
      where: query,
      data: data,
    });
  }

  findAll() {
    return `This action returns all user`;
  }

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
    // 1. Find which classroom the student belongs to in this term
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

    // 2. Get all student user IDs in that classroom
    const classroomStudents = await this.prisma.classroomStudent.findMany({
      where: { classroomId: enrollment.classroomId },
      select: {
        studentId: true,
      },
    });

    const studentUserIds = classroomStudents.map((cs) => cs.studentId);

    // 3. Get student profiles with wallet balances for those users in this term
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

    // 4. Sort by wallet balance descending and compute rank
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
