import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  QuestSubmissionStatus,
  QuestStatus,
  QuestType,
  TransactionType,
  type User,
  type Quest,
} from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateQuestDto } from './dto/create-quest.dto';
import { UpdateQuestDto } from './dto/update-quest.dto';
import { ListQuestsQueryDto } from './dto/list-quests-query.dto';
import { ListMyQuestsQueryDto } from './dto/list-my-quests-query.dto';
import { SubmitQuestDto } from './dto/submit-quest.dto';
import {
  ApproveSubmissionDto,
  RejectSubmissionDto,
} from './dto/review-submission.dto';

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

  async listMyQuests(user: CurrentUser, query: ListMyQuestsQueryDto) {
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
      orderBy: { createdAt: 'desc' },
      ...(query.limit ? { take: query.limit } : {}),
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

  private ensureExpectedUpdatedAt(
    currentUpdatedAt: Date,
    expectedUpdatedAt?: string,
  ) {
    if (!expectedUpdatedAt) {
      return;
    }

    const parsed = new Date(expectedUpdatedAt);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('expectedUpdatedAt must be valid ISO date');
    }

    if (parsed.getTime() !== currentUpdatedAt.getTime()) {
      throw new BadRequestException(
        'Submission state conflict: record was updated by another action',
      );
    }
  }

  private async getStudentProfileInQuestTerm(quest: Quest, userId: string) {
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

  private async rewardQuestToWallet(
    tx: Prisma.TransactionClient,
    submissionId: string,
    studentProfileId: string,
    quest: {
      id: string;
      title: string;
      rewardCoins: number;
    },
    extraMetadata?: Record<string, unknown>,
  ) {
    if (quest.rewardCoins <= 0) {
      return;
    }

    const wallet = await tx.wallet.upsert({
      where: { studentProfileId },
      update: {},
      create: {
        studentProfileId,
        balance: new Prisma.Decimal(0),
      },
    });

    const updatedWallet = await tx.wallet.update({
      where: { id: wallet.id },
      data: {
        balance: wallet.balance.plus(quest.rewardCoins),
      },
    });

    await tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: TransactionType.QUEST_REWARD,
        amount: new Prisma.Decimal(quest.rewardCoins),
        balanceBefore: wallet.balance,
        balanceAfter: updatedWallet.balance,
        description: `Quest reward: ${quest.title}`,
        metadata: {
          source: 'QUEST_REWARD',
          refId: submissionId,
          questId: quest.id,
          ...(extraMetadata ?? {}),
        },
      },
    });
  }

  private async approveSubmissionAndReward(
    tx: Prisma.TransactionClient,
    params: {
      submissionId: string;
      studentProfileId: string;
      quest: {
        id: string;
        title: string;
        rewardCoins: number;
      };
      reviewedById?: string;
      includeQuest?: boolean;
      extraMetadata?: Record<string, unknown>;
    },
  ) {
    const include: Prisma.QuestSubmissionInclude = {
      versions: {
        orderBy: { versionNo: 'desc' },
        take: 1,
      },
    };

    if (params.includeQuest) {
      include.quest = {
        select: {
          id: true,
          title: true,
          type: true,
          description: true,
        },
      };
    }

    const approvedSubmission = await tx.questSubmission.update({
      where: { id: params.submissionId },
      data: {
        status: QuestSubmissionStatus.APPROVED,
        rejectReason: null,
        ...(params.reviewedById ? { reviewedById: params.reviewedById } : {}),
      },
      include,
    });

    await this.rewardQuestToWallet(
      tx,
      params.submissionId,
      params.studentProfileId,
      params.quest,
      params.extraMetadata,
    );

    return approvedSubmission;
  }

  async submitMyQuest(questId: string, user: CurrentUser, dto: SubmitQuestDto) {
    this.assertStudent(user);

    const quest = await this.ensureQuestMembership(questId, user.id);
    if (quest.type === QuestType.QUIZ) {
      throw new BadRequestException(
        'QUIZ quest submission must be done via quiz attempts',
      );
    }
    if (quest.status !== QuestStatus.PUBLISHED) {
      throw new BadRequestException('Quest is not open for submission');
    }

    const studentProfile = await this.getStudentProfileInQuestTerm(
      quest,
      user.id,
    );

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const existing = await tx.questSubmission.findUnique({
          where: {
            questId_studentProfileId: {
              questId,
              studentProfileId: studentProfile.id,
            },
          },
          select: {
            id: true,
            status: true,
            latestVersionNo: true,
            updatedAt: true,
          },
        });

        if (!existing) {
          if (dto.expectedLatestVersionNo !== undefined) {
            throw new BadRequestException(
              'Submission state conflict: expectedLatestVersionNo does not match current state',
            );
          }

          const created = await tx.questSubmission.create({
            data: {
              questId,
              studentProfileId: studentProfile.id,
              status: QuestSubmissionStatus.PENDING,
              latestVersionNo: 1,
            },
            select: { id: true },
          });

          await tx.questSubmissionVersion.create({
            data: {
              submissionId: created.id,
              versionNo: 1,
              payloadJson:
                (dto.payloadJson as Prisma.InputJsonValue) ?? Prisma.JsonNull,
              attachmentUrl: dto.attachmentUrl,
            },
          });

          return tx.questSubmission.findUnique({
            where: { id: created.id },
            include: {
              versions: {
                orderBy: { versionNo: 'desc' },
              },
            },
          });
        }

        if (existing.status === QuestSubmissionStatus.APPROVED) {
          throw new BadRequestException(
            'Submission already approved and cannot be edited',
          );
        }

        if (
          dto.expectedLatestVersionNo !== undefined &&
          dto.expectedLatestVersionNo !== existing.latestVersionNo
        ) {
          throw new BadRequestException(
            'Submission state conflict: expectedLatestVersionNo does not match current state',
          );
        }

        const lock = await tx.questSubmission.updateMany({
          where: {
            id: existing.id,
            latestVersionNo: existing.latestVersionNo,
          },
          data: {
            latestVersionNo: { increment: 1 },
            status: QuestSubmissionStatus.PENDING,
            rejectReason: null,
          },
        });

        if (lock.count !== 1) {
          throw new BadRequestException(
            'Submission state conflict: please refresh and try again',
          );
        }

        const nextVersionNo = existing.latestVersionNo + 1;
        await tx.questSubmissionVersion.create({
          data: {
            submissionId: existing.id,
            versionNo: nextVersionNo,
            payloadJson:
              (dto.payloadJson as Prisma.InputJsonValue) ?? Prisma.JsonNull,
            attachmentUrl: dto.attachmentUrl,
          },
        });

        return tx.questSubmission.findUnique({
          where: { id: existing.id },
          include: {
            versions: {
              orderBy: { versionNo: 'desc' },
            },
          },
        });
      });

      return { success: true, data: result };
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message.toLowerCase() : String(error);
      if (
        message.includes('unique constraint') ||
        message.includes('quest_submission_versions_submissionid_versionno_key')
      ) {
        throw new BadRequestException(
          'Submission state conflict: please refresh and try again',
        );
      }
      throw error;
    }
  }

  async approveSubmission(
    submissionId: string,
    user: CurrentUser,
    dto: ApproveSubmissionDto,
  ) {
    this.assertTeacherOrAdmin(user);

    const submission = await this.prisma.questSubmission.findUnique({
      where: { id: submissionId },
      select: {
        id: true,
        status: true,
        updatedAt: true,
        studentProfileId: true,
        quest: {
          select: {
            id: true,
            title: true,
            rewardCoins: true,
          },
        },
      },
    });

    if (!submission) {
      throw new NotFoundException('Submission not found');
    }

    this.ensureExpectedUpdatedAt(submission.updatedAt, dto.expectedUpdatedAt);

    if (submission.status === QuestSubmissionStatus.APPROVED) {
      throw new BadRequestException('Submission is already approved');
    }

    const updated = await this.prisma.$transaction((tx) =>
      this.approveSubmissionAndReward(tx, {
        submissionId,
        studentProfileId: submission.studentProfileId,
        quest: submission.quest,
        reviewedById: user.id,
      }),
    );

    return { success: true, data: updated };
  }

  async rejectSubmission(
    submissionId: string,
    user: CurrentUser,
    dto: RejectSubmissionDto,
  ) {
    this.assertTeacherOrAdmin(user);

    const submission = await this.prisma.questSubmission.findUnique({
      where: { id: submissionId },
      select: {
        id: true,
        status: true,
        updatedAt: true,
      },
    });

    if (!submission) {
      throw new NotFoundException('Submission not found');
    }

    this.ensureExpectedUpdatedAt(submission.updatedAt, dto.expectedUpdatedAt);

    if (submission.status === QuestSubmissionStatus.REJECTED) {
      throw new BadRequestException('Submission is already rejected');
    }

    const updated = await this.prisma.questSubmission.update({
      where: { id: submissionId },
      data: {
        status: QuestSubmissionStatus.REJECTED,
        reviewedById: user.id,
        rejectReason: dto.rejectReason,
      },
      include: {
        versions: {
          orderBy: { versionNo: 'desc' },
          take: 1,
        },
      },
    });

    return { success: true, data: updated };
  }

  async completeInteractiveQuest(userId: string, actionType: string) {
    if (!actionType?.trim()) {
      throw new BadRequestException('actionType is required');
    }

    try {
      const submission = await this.prisma.questSubmission.findFirst({
        where: {
          status: QuestSubmissionStatus.PENDING,
          studentProfile: {
            userId,
          },
          quest: {
            type: QuestType.INTERACTIVE,
          },
        },
        orderBy: {
          createdAt: 'asc',
        },
        include: {
          versions: {
            orderBy: { versionNo: 'desc' },
            take: 1,
          },
          quest: {
            select: {
              id: true,
              title: true,
              type: true,
              description: true,
              rewardCoins: true,
            },
          },
          studentProfile: {
            select: {
              id: true,
              userId: true,
            },
          },
        },
      });
      if (!submission) {
        throw new NotFoundException(
          'No pending interactive quest submission found for this action',
        );
      }

      const updated = await this.prisma.$transaction((tx) =>
        this.approveSubmissionAndReward(tx, {
          submissionId: submission.id,
          studentProfileId: submission.studentProfile.id,
          quest: submission.quest,
          includeQuest: true,
          extraMetadata: { actionType },
        }),
      );

      return { success: true, data: updated };
    } catch (error: unknown) {
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }

      throw new BadRequestException('Unable to complete interactive quest');
    }
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
