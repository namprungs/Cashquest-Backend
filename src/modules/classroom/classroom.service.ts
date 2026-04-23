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
