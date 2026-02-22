import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  QuestStatus,
  QuestType,
  type User,
  type Quest,
} from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateQuestDto } from './dto/create-quest.dto';
import { UpdateQuestDto } from './dto/update-quest.dto';
import { ListQuestsQueryDto } from './dto/list-quests-query.dto';

type CurrentUser = User & { role?: { name?: string } | null };

@Injectable()
export class QuestService {
  constructor(private readonly prisma: PrismaService) {}

  private assertTeacherOrAdmin(user: CurrentUser) {
    const roleName = user?.role?.name?.toUpperCase?.();
    if (!roleName || !['TEACHER', 'ADMIN', 'SUPER_ADMIN'].includes(roleName)) {
      throw new ForbiddenException(
        'Only teacher/admin can perform this action',
      );
    }
  }

  private assertStudent(user: CurrentUser) {
    const roleName = user?.role?.name?.toUpperCase?.();
    if (!roleName || roleName !== 'STUDENT') {
      throw new ForbiddenException('Only student can perform this action');
    }
  }

  private async validateClassroomsInTerm(
    classroomIds: string[],
    termId: string,
  ) {
    if (!classroomIds.length) {
      return;
    }

    const classrooms = await this.prisma.classroom.findMany({
      where: {
        id: { in: classroomIds },
        termId,
      },
      select: { id: true },
    });

    if (classrooms.length !== new Set(classroomIds).size) {
      throw new BadRequestException(
        'Some classroomIds are invalid for the term',
      );
    }
  }

  private async validateQuestQuizConsistency(
    dto: Pick<CreateQuestDto, 'type' | 'quizId' | 'termId'>,
  ) {
    if (dto.type !== QuestType.QUIZ && dto.quizId) {
      throw new BadRequestException(
        'quizId is only allowed for QUIZ quest type',
      );
    }

    if (dto.type === QuestType.QUIZ && !dto.quizId) {
      throw new BadRequestException('quizId is required when type is QUIZ');
    }

    if (dto.quizId) {
      const quiz = await this.prisma.quiz.findUnique({
        where: { id: dto.quizId },
        select: {
          id: true,
          module: {
            select: {
              termId: true,
            },
          },
        },
      });
      if (!quiz) {
        throw new NotFoundException('Quiz not found');
      }
      if (!quiz.module?.termId) {
        throw new BadRequestException(
          'Quiz must be linked to a term via learning module',
        );
      }
      if (quiz.module.termId !== dto.termId) {
        throw new BadRequestException('Quiz term does not match quest term');
      }
    }
  }

  private toQuestInclude() {
    return {
      classrooms: {
        include: {
          classroom: {
            select: {
              id: true,
              name: true,
              termId: true,
            },
          },
        },
      },
      quiz: {
        select: {
          id: true,
          moduleId: true,
        },
      },
      term: {
        select: {
          id: true,
          name: true,
          status: true,
        },
      },
      _count: {
        select: {
          submissions: true,
        },
      },
    } satisfies Prisma.QuestInclude;
  }

  async createQuest(user: CurrentUser, dto: CreateQuestDto) {
    this.assertTeacherOrAdmin(user);

    const term = await this.prisma.term.findUnique({
      where: { id: dto.termId },
      select: { id: true },
    });
    if (!term) {
      throw new NotFoundException('Term not found');
    }

    await this.validateQuestQuizConsistency({
      type: dto.type,
      quizId: dto.quizId,
      termId: dto.termId,
    });
    await this.validateClassroomsInTerm(dto.classroomIds, dto.termId);

    const created = await this.prisma.$transaction(async (tx) => {
      const quest = await tx.quest.create({
        data: {
          termId: dto.termId,
          type: dto.type,
          quizId: dto.quizId,
          title: dto.title,
          description: dto.description,
          rewardCoins: dto.rewardCoins,
          status: dto.status,
          startAt: dto.startAt,
          deadlineAt: dto.deadlineAt,
          createdById: user.id,
        },
        select: { id: true },
      });

      if (dto.classroomIds.length) {
        await tx.questClassroom.createMany({
          data: dto.classroomIds.map((classroomId) => ({
            questId: quest.id,
            classroomId,
          })),
          skipDuplicates: true,
        });
      }

      return tx.quest.findUnique({
        where: { id: quest.id },
        include: this.toQuestInclude(),
      });
    });

    return { success: true, data: created };
  }

  async updateQuest(questId: string, user: CurrentUser, dto: UpdateQuestDto) {
    this.assertTeacherOrAdmin(user);

    const existing = await this.prisma.quest.findUnique({
      where: { id: questId },
      select: {
        id: true,
        termId: true,
        type: true,
        quizId: true,
      },
    });

    if (!existing) {
      throw new NotFoundException('Quest not found');
    }

    const nextTermId = dto.termId ?? existing.termId;
    const nextType = dto.type ?? existing.type;
    const nextQuizId = dto.quizId ?? existing.quizId ?? undefined;

    if (dto.termId && !dto.classroomIds) {
      throw new BadRequestException(
        'classroomIds must be provided when changing termId to keep assignments valid',
      );
    }

    if (dto.termId) {
      const term = await this.prisma.term.findUnique({
        where: { id: dto.termId },
        select: { id: true },
      });
      if (!term) {
        throw new NotFoundException('Term not found');
      }
    }

    await this.validateQuestQuizConsistency({
      type: nextType,
      quizId: nextQuizId,
      termId: nextTermId,
    });

    if (dto.classroomIds) {
      await this.validateClassroomsInTerm(dto.classroomIds, nextTermId);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.quest.update({
        where: { id: questId },
        data: {
          ...(dto.termId ? { termId: dto.termId } : {}),
          ...(dto.type ? { type: dto.type } : {}),
          ...(dto.quizId !== undefined ? { quizId: dto.quizId } : {}),
          ...(dto.title !== undefined ? { title: dto.title } : {}),
          ...(dto.description !== undefined
            ? { description: dto.description }
            : {}),
          ...(dto.rewardCoins !== undefined
            ? { rewardCoins: dto.rewardCoins }
            : {}),
          ...(dto.status ? { status: dto.status } : {}),
          ...(dto.startAt !== undefined ? { startAt: dto.startAt } : {}),
          ...(dto.deadlineAt !== undefined
            ? { deadlineAt: dto.deadlineAt }
            : {}),
        },
      });

      if (dto.classroomIds) {
        await tx.questClassroom.deleteMany({ where: { questId } });

        if (dto.classroomIds.length) {
          await tx.questClassroom.createMany({
            data: dto.classroomIds.map((classroomId) => ({
              questId,
              classroomId,
            })),
            skipDuplicates: true,
          });
        }
      }

      return tx.quest.findUnique({
        where: { id: questId },
        include: this.toQuestInclude(),
      });
    });

    return { success: true, data: updated };
  }

  async listQuests(query: ListQuestsQueryDto) {
    const where: Prisma.QuestWhereInput = {
      ...(query.termId ? { termId: query.termId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.search
        ? {
            OR: [
              { title: { contains: query.search, mode: 'insensitive' } },
              { description: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const quests = await this.prisma.quest.findMany({
      where,
      include: this.toQuestInclude(),
      orderBy: { createdAt: 'desc' },
    });

    return { success: true, data: quests };
  }

  async getQuestById(questId: string) {
    const quest = await this.prisma.quest.findUnique({
      where: { id: questId },
      include: this.toQuestInclude(),
    });

    if (!quest) {
      throw new NotFoundException('Quest not found');
    }

    return { success: true, data: quest };
  }

  async publishQuest(questId: string, user: CurrentUser) {
    this.assertTeacherOrAdmin(user);
    return this.updateQuestStatus(questId, QuestStatus.PUBLISHED);
  }

  async closeQuest(questId: string, user: CurrentUser) {
    this.assertTeacherOrAdmin(user);
    return this.updateQuestStatus(questId, QuestStatus.CLOSED);
  }

  private async updateQuestStatus(questId: string, status: QuestStatus) {
    const quest = await this.prisma.quest.findUnique({
      where: { id: questId },
      select: { id: true },
    });
    if (!quest) {
      throw new NotFoundException('Quest not found');
    }

    const updated = await this.prisma.quest.update({
      where: { id: questId },
      data: { status },
      include: this.toQuestInclude(),
    });

    return { success: true, data: updated };
  }

  private async getStudentContext(user: CurrentUser) {
    const memberships = await this.prisma.classroomStudent.findMany({
      where: { studentId: user.id },
      select: {
        classroomId: true,
        classroom: {
          select: {
            termId: true,
          },
        },
      },
    });

    if (!memberships.length) {
      return {
        classroomIds: [] as string[],
        termIds: [] as string[],
      };
    }

    const classroomIds = memberships.map((m) => m.classroomId);
    const termIds = [...new Set(memberships.map((m) => m.classroom.termId))];

    return { classroomIds, termIds };
  }

  async listMyQuests(user: CurrentUser) {
    this.assertStudent(user);

    const context = await this.getStudentContext(user);
    if (!context.classroomIds.length) {
      return { success: true, data: [] };
    }

    const quests = await this.prisma.quest.findMany({
      where: {
        status: QuestStatus.PUBLISHED,
        termId: { in: context.termIds },
        classrooms: {
          some: {
            classroomId: { in: context.classroomIds },
          },
        },
      },
      include: this.toQuestInclude(),
      orderBy: { createdAt: 'desc' },
    });

    return { success: true, data: quests };
  }

  private async ensureQuestMembership(
    questId: string,
    userId: string,
  ): Promise<Quest> {
    const quest = await this.prisma.quest.findUnique({
      where: { id: questId },
    });
    if (!quest) {
      throw new NotFoundException('Quest not found');
    }

    const membership = await this.prisma.classroomStudent.findFirst({
      where: {
        studentId: userId,
        classroom: {
          questClassrooms: {
            some: {
              questId,
            },
          },
        },
      },
      select: { classroomId: true },
    });

    if (!membership) {
      throw new ForbiddenException('Quest is not assigned to your classroom');
    }

    return quest;
  }

  async getMyQuestDetail(questId: string, user: CurrentUser) {
    this.assertStudent(user);

    const quest = await this.ensureQuestMembership(questId, user.id);
    const profile = await this.prisma.studentProfile.findUnique({
      where: {
        userId_termId: {
          userId: user.id,
          termId: quest.termId,
        },
      },
      select: { id: true },
    });

    if (!profile) {
      throw new ForbiddenException(
        'Student profile for this term is not found',
      );
    }

    const questDetail = await this.prisma.quest.findUnique({
      where: { id: questId },
      include: this.toQuestInclude(),
    });

    if (!questDetail) {
      throw new NotFoundException('Quest not found');
    }

    if (quest.type === QuestType.QUIZ) {
      let attempts: unknown[] = [];
      let passed = false;

      if (quest.quizId) {
        const quizAttempts = await this.prisma.quizAttempt.findMany({
          where: {
            quizId: quest.quizId,
            studentProfileId: profile.id,
          },
          select: {
            id: true,
            attemptNo: true,
            score: true,
            isPassed: true,
            submittedAt: true,
            createdAt: true,
          },
          orderBy: { attemptNo: 'desc' },
        });

        attempts = quizAttempts;
        passed = quizAttempts.some((attempt) => attempt.isPassed);
      }

      return {
        success: true,
        data: {
          ...questDetail,
          studentState: {
            type: 'QUIZ',
            attempts,
            passed,
          },
        },
      };
    }

    const submission = await this.prisma.questSubmission.findUnique({
      where: {
        questId_studentProfileId: {
          questId,
          studentProfileId: profile.id,
        },
      },
      select: {
        id: true,
        status: true,
        latestVersionNo: true,
        updatedAt: true,
      },
    });

    return {
      success: true,
      data: {
        ...questDetail,
        studentState: {
          type: 'SUBMISSION',
          submission,
        },
      },
    };
  }
}
