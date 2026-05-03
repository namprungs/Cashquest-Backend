import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  QuestStatus,
  QuestSubmissionStatus,
  QuestType,
  type Quest,
} from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import type { CurrentUser } from 'src/common/types/current-user.type';
import { getRoleName, assertStudent } from 'src/common/utils/role.utils';
import { ListQuestsQueryDto } from '../dto/list-quests-query.dto';
import { ListMyQuestsQueryDto } from '../dto/list-my-quests-query.dto';

const TEACHER_QUIZ_DRAFT_CONTENT_TYPE = 'TEACHER_QUIZ_DRAFT_V1';

@Injectable()
export class QuestQueryService {
  constructor(private readonly prisma: PrismaService) {}

  toQuestInclude() {
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
          timeLimitSec: true,
          passAllRequired: true,
          questions: {
            orderBy: { orderNo: 'asc' as const },
            include: {
              choices: {
                orderBy: { orderNo: 'asc' as const },
              },
            },
          },
        },
      },
      term: {
        select: {
          id: true,
          name: true,
          status: true,
        },
      },
      parent: {
        select: {
          id: true,
          title: true,
          orderNo: true,
        },
      },
      children: {
        include: {
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
          _count: {
            select: {
              submissions: true,
            },
          },
        },
        orderBy: { orderNo: 'asc' as const },
      },
      _count: {
        select: {
          submissions: true,
        },
      },
    } as Prisma.QuestInclude;
  }

  parseTeacherQuizDraftContent(content?: string | null) {
    if (!content) {
      return null;
    }
    try {
      const parsed = JSON.parse(content) as Record<string, unknown>;
      if (parsed?.type !== TEACHER_QUIZ_DRAFT_CONTENT_TYPE) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  async listQuests(query: ListQuestsQueryDto) {
    return this.fetchQuests(query);
  }

  private async fetchQuests(query: ListQuestsQueryDto) {
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
      ...(query.parentId === 'null'
        ? { parentId: null }
        : query.parentId
          ? { parentId: query.parentId }
          : {}),
      ...(query.isSystem !== undefined ? { isSystem: query.isSystem } : {}),
    };

    const quests = await this.prisma.quest.findMany({
      where,
      include: this.toQuestInclude(),
      orderBy: [{ parentId: 'asc' }, { orderNo: 'asc' }, { createdAt: 'desc' }],
    });

    return { success: true, data: quests };
  }

  async getQuestById(questId: string, user?: CurrentUser) {
    const quest = await this.prisma.quest.findUnique({
      where: { id: questId },
      include: this.toQuestInclude(),
    });

    if (!quest) {
      throw new NotFoundException('Quest not found');
    }

    if (user) {
      const roleName = getRoleName(user);
      if (
        ['TEACHER', 'ADMIN', 'SUPER_ADMIN'].includes(roleName) &&
        quest.createdById !== user.id &&
        roleName !== 'ADMIN' &&
        roleName !== 'SUPER_ADMIN'
      ) {
        throw new ForbiddenException('Only quest owner can view this quest');
      }
    }

    return {
      success: true,
      data: {
        ...quest,
        draftContent: this.parseTeacherQuizDraftContent(quest.content),
      },
    };
  }

  async listMyQuests(user: CurrentUser, query: ListMyQuestsQueryDto) {
    return this.fetchMyQuests(user, query);
  }

  private async fetchMyQuests(user: CurrentUser, query: ListMyQuestsQueryDto) {
    const roleName = getRoleName(user);

    if (['TEACHER', 'ADMIN', 'SUPER_ADMIN'].includes(roleName)) {
      const quests = await this.prisma.quest.findMany({
        where: {
          createdById: user.id,
          isSystem: false,
          ...(query.isSystem !== undefined ? { isSystem: query.isSystem } : {}),
          ...(query.type ? { type: query.type } : {}),
          ...(query.status ? { status: query.status } : {}),
          ...(query.classroomId
            ? {
                classrooms: {
                  some: {
                    classroomId: query.classroomId,
                  },
                },
              }
            : {}),
        },
        include: this.toQuestInclude(),
        orderBy: [
          { parentId: 'asc' },
          { orderNo: 'asc' },
          { createdAt: 'desc' },
        ],
        ...(query.limit ? { take: query.limit } : {}),
      });

      return { success: true, data: quests };
    }

    assertStudent(user);

    const context = await this.getStudentContext(user);
    if (!context.classroomIds.length) {
      return { success: true, data: [] };
    }

    const quests = await this.prisma.quest.findMany({
      where: {
        status: QuestStatus.PUBLISHED,
        termId: { in: context.termIds },
        ...(query.isSystem !== undefined ? { isSystem: query.isSystem } : {}),
        ...(query.hideExpired
          ? {
              deadlineAt: {
                gte: new Date(),
              },
            }
          : {}),
        classrooms: {
          some: {
            classroomId: { in: context.classroomIds },
          },
        },
        ...(query.notSubmittedOnly
          ? {
              submissions: {
                none: {
                  studentProfile: {
                    userId: user.id,
                  },
                },
              },
            }
          : {}),
      },
      include: this.toQuestInclude(),
      orderBy: [{ parentId: 'asc' }, { orderNo: 'asc' }, { createdAt: 'desc' }],
      ...(query.limit ? { take: query.limit } : {}),
    });

    const studentProfiles = await this.prisma.studentProfile.findMany({
      where: {
        userId: user.id,
        termId: { in: context.termIds },
      },
      select: { id: true },
    });
    const studentProfileIds = studentProfiles.map((profile) => profile.id);
    const questIds = new Set<string>();
    const quizIds = new Set<string>();

    for (const quest of quests) {
      questIds.add(quest.id);
      if (quest.quizId) {
        quizIds.add(quest.quizId);
      }
      for (const child of quest.children ?? []) {
        questIds.add(child.id);
        if (child.quizId) {
          quizIds.add(child.quizId);
        }
      }
    }

    const submissions = studentProfileIds.length
      ? await this.prisma.questSubmission.findMany({
          where: {
            studentProfileId: { in: studentProfileIds },
            questId: { in: [...questIds] },
          },
          select: { questId: true, status: true },
        })
      : [];

    const passedAttempts = studentProfileIds.length
      ? await this.prisma.quizAttempt.findMany({
          where: {
            studentProfileId: { in: studentProfileIds },
            quizId: { in: [...quizIds] },
            isPassed: true,
          },
          select: { quizId: true },
        })
      : [];

    const completedQuestIds = new Set(
      submissions
        .filter(
          (submission) => submission.status === QuestSubmissionStatus.APPROVED,
        )
        .map((submission) => submission.questId),
    );
    const completedQuizIds = new Set(
      passedAttempts.map((attempt) => attempt.quizId),
    );
    const submissionStatusByQuestId = new Map(
      submissions.map((submission) => [submission.questId, submission.status]),
    );
    const isQuestCompleted = (quest: (typeof quests)[number]) =>
      completedQuestIds.has(quest.id) ||
      (!!quest.quizId && completedQuizIds.has(quest.quizId));

    const questsWithCompletion = quests.map((quest) => ({
      ...quest,
      isCompleted: isQuestCompleted(quest),
      submissionStatus: submissionStatusByQuestId.get(quest.id) ?? null,
      children: (quest.children ?? []).map((child) => ({
        ...child,
        isCompleted:
          completedQuestIds.has(child.id) ||
          (!!child.quizId && completedQuizIds.has(child.quizId)),
        submissionStatus: submissionStatusByQuestId.get(child.id) ?? null,
      })),
    }));

    return { success: true, data: questsWithCompletion };
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

  async ensureQuestMembership(questId: string, userId: string): Promise<Quest> {
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

  async getStudentProfileInQuestTerm(quest: Quest, userId: string) {
    const profile = await this.prisma.studentProfile.findUnique({
      where: {
        userId_termId: {
          userId,
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

    return profile;
  }

  async getMyQuestDetail(questId: string, user: CurrentUser) {
    assertStudent(user);

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
      include: {
        versions: {
          orderBy: { versionNo: 'desc' },
          take: 5,
        },
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
