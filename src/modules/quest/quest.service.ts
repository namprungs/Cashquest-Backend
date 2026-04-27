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

  private normalizeActionType(value: unknown) {
    return String(value ?? '')
      .trim()
      .replace(/[_\s-]+/g, '')
      .toUpperCase();
  }

  private getRoleName(user: CurrentUser) {
    return user?.role?.name?.toUpperCase?.() ?? '';
  }

  private assertTeacherOrAdmin(user: CurrentUser) {
    const roleName = this.getRoleName(user);
    if (!roleName || !['TEACHER', 'ADMIN', 'SUPER_ADMIN'].includes(roleName)) {
      throw new ForbiddenException(
        'Only teacher/admin can perform this action',
      );
    }
  }

  private assertStudent(user: CurrentUser) {
    const roleName = this.getRoleName(user);
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

  async createQuest(user: CurrentUser, dto: CreateQuestDto) {
    this.assertTeacherOrAdmin(user);

    const term = await this.prisma.term.findUnique({
      where: { id: dto.termId },
      select: { id: true },
    });
    if (!term) {
      throw new NotFoundException('Term not found');
    }

    // Validate parentId if provided
    if (dto.parentId) {
      const parentQuest = await this.prisma.quest.findUnique({
        where: { id: dto.parentId },
        select: { id: true, termId: true, parentId: true },
      });
      if (!parentQuest) {
        throw new NotFoundException('Parent quest not found');
      }
      if (parentQuest.termId !== dto.termId) {
        throw new BadRequestException(
          'Parent quest must belong to the same term',
        );
      }
      if (parentQuest.parentId) {
        throw new BadRequestException(
          'Cannot nest quests more than one level deep',
        );
      }
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
          content: dto.content,
          isSystem: dto.isSystem ?? false,
          rewardCoins: dto.rewardCoins,
          difficulty: dto.difficulty ?? 'EASY',
          status: dto.status,
          startAt: dto.startAt,
          deadlineAt: dto.deadlineAt,
          createdById: user.id,
          parentId: dto.parentId ?? null,
          orderNo: dto.orderNo ?? null,
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
        parentId: true,
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

    // Validate parentId if being changed
    if (dto.parentId !== undefined) {
      if (dto.parentId !== null) {
        // Check for circular reference
        if (dto.parentId === questId) {
          throw new BadRequestException('A quest cannot be its own parent');
        }
        const parentQuest = await this.prisma.quest.findUnique({
          where: { id: dto.parentId },
          select: { id: true, termId: true, parentId: true },
        });
        if (!parentQuest) {
          throw new NotFoundException('Parent quest not found');
        }
        const effectiveTermId = dto.termId ?? existing.termId;
        if (parentQuest.termId !== effectiveTermId) {
          throw new BadRequestException(
            'Parent quest must belong to the same term',
          );
        }
        if (parentQuest.parentId) {
          throw new BadRequestException(
            'Cannot nest quests more than one level deep',
          );
        }
      }
      // Prevent parent quest from having its own parentId set
      if (dto.parentId === null && existing.parentId === null) {
        // This quest is already a root quest, no issue
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
          ...(dto.content !== undefined ? { content: dto.content } : {}),
          ...(dto.isSystem !== undefined ? { isSystem: dto.isSystem } : {}),
          ...(dto.rewardCoins !== undefined
            ? { rewardCoins: dto.rewardCoins }
            : {}),
          ...(dto.difficulty !== undefined
            ? { difficulty: dto.difficulty }
            : {}),
          ...(dto.status ? { status: dto.status } : {}),
          ...(dto.startAt !== undefined ? { startAt: dto.startAt } : {}),
          ...(dto.deadlineAt !== undefined
            ? { deadlineAt: dto.deadlineAt }
            : {}),
          ...(dto.parentId !== undefined ? { parentId: dto.parentId } : {}),
          ...(dto.orderNo !== undefined ? { orderNo: dto.orderNo } : {}),
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
    const roleName = this.getRoleName(user);

    if (['TEACHER', 'ADMIN', 'SUPER_ADMIN'].includes(roleName)) {
      const quests = await this.prisma.quest.findMany({
        where: {
          createdById: user.id,
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
      orderBy: [{ parentId: 'asc' }, { orderNo: 'asc' }, { createdAt: 'desc' }],
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
    // System-generated QUIZ quests use the quiz attempt auto-grading flow.
    // Teacher-created QUIZ quests are submitted here for manual teacher review.
    if (quest.type === QuestType.QUIZ && quest.isSystem) {
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

        // If submission already exists and is APPROVED, don't allow editing
        if (existing.status === QuestSubmissionStatus.APPROVED) {
          throw new BadRequestException(
            'Submission already approved and cannot be edited',
          );
        }

        // If submission already exists and is PENDING, just return it (no duplicate)
        if (existing.status === QuestSubmissionStatus.PENDING) {
          return tx.questSubmission.findUnique({
            where: { id: existing.id },
            include: {
              versions: {
                orderBy: { versionNo: 'desc' },
              },
            },
          });
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

      // Auto-complete interactive quests if the action is already done
      if (
        quest.type === QuestType.INTERACTIVE &&
        result?.status === QuestSubmissionStatus.PENDING
      ) {
        const payload = result.versions?.[0]?.payloadJson as
          | Record<string, unknown>
          | undefined
          | null;
        const actionType = this.normalizeActionType(payload?.actionType);

        if (actionType === 'OPENSAVINGACCOUNT') {
          const existingAccount = await this.prisma.savingsAccount.findFirst({
            where: {
              studentProfileId: studentProfile.id,
              status: 'ACTIVE',
            },
            select: { id: true },
          });

          if (existingAccount) {
            await this.completeInteractiveQuest(user.id, 'OPENSAVINGACCOUNT');
          }
        }
      }

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

  async getSubmissionDetail(submissionId: string) {
    const submission = await this.prisma.questSubmission.findUnique({
      where: { id: submissionId },
      select: {
        id: true,
        status: true,
        latestVersionNo: true,
        createdAt: true,
        updatedAt: true,
        rejectReason: true,
        quest: {
          select: {
            id: true,
            title: true,
            description: true,
            type: true,
            rewardCoins: true,
            deadlineAt: true,
            quizId: true,
          },
        },
        studentProfile: {
          select: {
            id: true,
            user: {
              select: { id: true, username: true },
            },
          },
        },
        reviewedBy: {
          select: { id: true, username: true },
        },
        versions: {
          orderBy: { versionNo: 'desc' },
          select: {
            id: true,
            versionNo: true,
            payloadJson: true,
            attachmentUrl: true,
            createdAt: true,
          },
        },
      },
    });

    if (!submission) {
      throw new NotFoundException('Submission not found');
    }

    const latestVersion = submission.versions[0] ?? null;
    const isLate = submission.quest.deadlineAt
      ? submission.createdAt > submission.quest.deadlineAt
      : false;

    // For QUIZ-type quests, fetch quiz questions + student answers
    let quizData: unknown = null;
    if (submission.quest.type === 'QUIZ' && submission.quest.quizId) {
      const quizId = submission.quest.quizId;

      // Get the latest submitted attempt for this student
      const latestAttempt = await this.prisma.quizAttempt.findFirst({
        where: {
          quizId,
          studentProfileId: submission.studentProfile.id,
          submittedAt: { not: null },
        },
        orderBy: { attemptNo: 'desc' },
        select: {
          id: true,
          score: true,
          isPassed: true,
          submittedAt: true,
        },
      });

      if (latestAttempt) {
        // Get all questions with choices
        const questions = await this.prisma.quizQuestion.findMany({
          where: { quizId },
          include: { choices: true },
          orderBy: { orderNo: 'asc' },
        });

        // Get student answers for this attempt
        const answers = await this.prisma.quizAttemptAnswer.findMany({
          where: { attemptId: latestAttempt.id },
        });

        // Get selected choice IDs per question for this attempt
        const answerChoices =
          await this.prisma.quizAttemptAnswerChoice.findMany({
            where: { attemptId: latestAttempt.id },
            select: { questionId: true, choiceId: true },
          });

        const choiceIdsByQuestion = new Map<string, string[]>();
        for (const ac of answerChoices) {
          const list = choiceIdsByQuestion.get(ac.questionId) ?? [];
          list.push(ac.choiceId);
          choiceIdsByQuestion.set(ac.questionId, list);
        }

        const answerByQuestionId = new Map(
          answers.map((a) => [a.questionId, a]),
        );

        quizData = {
          attemptId: latestAttempt.id,
          attemptScore: latestAttempt.score,
          isPassed: latestAttempt.isPassed,
          questions: questions.map((q) => {
            const answer = answerByQuestionId.get(q.id);
            const selectedChoiceIds = choiceIdsByQuestion.get(q.id) ?? [];

            return {
              id: q.id,
              questionText: q.questionText,
              questionType: q.questionType,
              orderNo: q.orderNo,
              points: q.points,
              gradingType: q.gradingType,
              choices: q.choices.map((c) => ({
                id: c.id,
                text: c.choiceText,
                isCorrect: c.isCorrect,
                orderNo: c.orderNo,
              })),
              studentAnswer: answer
                ? {
                    answerText: answer.answerText,
                    answerNumber: answer.answerNumber
                      ? Number(answer.answerNumber)
                      : null,
                    attachmentUrl: answer.attachmentUrl,
                    selectedChoiceIds,
                    isCorrect: answer.isCorrect,
                    awardedPoints: answer.awardedPoints,
                  }
                : null,
            };
          }),
        };
      }
    }

    return {
      success: true,
      data: {
        id: submission.id,
        status: submission.status,
        isLate,
        createdAt: submission.createdAt.toISOString(),
        updatedAt: submission.updatedAt.toISOString(),
        rejectReason: submission.rejectReason,
        quest: submission.quest,
        student: {
          id: submission.studentProfile.id,
          name: submission.studentProfile.user.username,
        },
        latestVersion: latestVersion
          ? {
              id: latestVersion.id,
              versionNo: latestVersion.versionNo,
              payloadJson: latestVersion.payloadJson,
              attachmentUrl: latestVersion.attachmentUrl,
              submittedAt: latestVersion.createdAt.toISOString(),
            }
          : null,
        versions: submission.versions.map((v) => ({
          id: v.id,
          versionNo: v.versionNo,
          attachmentUrl: v.attachmentUrl,
          submittedAt: v.createdAt.toISOString(),
        })),
        quiz: quizData,
      },
    };
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
      const requestedActionType = this.normalizeActionType(actionType);

      const pendingSubmissions = await this.prisma.questSubmission.findMany({
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

      const submission = pendingSubmissions.find((item) => {
        const latestPayload = item.versions[0]?.payloadJson;
        if (!latestPayload || typeof latestPayload !== 'object') {
          return true;
        }

        const payloadActionType = this.normalizeActionType(
          (latestPayload as Record<string, unknown>).actionType,
        );

        if (!payloadActionType) {
          return true;
        }

        return payloadActionType === requestedActionType;
      });

      if (!submission) {
        throw new NotFoundException(
          'No pending interactive quest submission found for this action',
        );
      }

      const updated = await this.prisma.$transaction(async (tx) => {
        // Only approve the submission — do NOT reward yet.
        // The student will claim coins manually via the quest page (claimQuestReward).
        const approvedSubmission = await tx.questSubmission.update({
          where: { id: submission.id },
          data: {
            status: QuestSubmissionStatus.APPROVED,
            rejectReason: null,
          },
          include: {
            versions: {
              orderBy: { versionNo: 'desc' },
              take: 1,
            },
            ...(true
              ? {
                  quest: {
                    select: {
                      id: true,
                      title: true,
                      type: true,
                      description: true,
                    },
                  },
                }
              : {}),
          },
        });

        return approvedSubmission;
      });

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

  async getInteractiveQuestStatus(questId: string, user: CurrentUser) {
    this.assertStudent(user);

    const quest = await this.prisma.quest.findUnique({
      where: { id: questId },
      select: {
        id: true,
        type: true,
        title: true,
        content: true,
        description: true,
        rewardCoins: true,
      },
    });

    if (!quest) {
      throw new NotFoundException('Quest not found');
    }

    if (quest.type !== QuestType.INTERACTIVE) {
      throw new BadRequestException('Quest is not an interactive quest');
    }

    const profile = await this.prisma.studentProfile.findFirst({
      where: { userId: user.id },
      select: { id: true },
    });

    if (!profile) {
      return {
        success: true,
        data: {
          isCompleted: false,
          isClaimed: false,
          status: 'NOT_STARTED',
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
        versions: {
          orderBy: { versionNo: 'desc' },
          take: 1,
          select: {
            payloadJson: true,
          },
        },
      },
    });

    if (!submission) {
      return {
        success: true,
        data: {
          isCompleted: false,
          isClaimed: false,
          status: 'NOT_STARTED',
        },
      };
    }

    const isApproved = submission.status === QuestSubmissionStatus.APPROVED;

    // Check if reward was already claimed (has a wallet transaction for this submission)
    const walletTransaction = await this.prisma.walletTransaction.findFirst({
      where: {
        wallet: {
          studentProfileId: profile.id,
        },
        type: TransactionType.QUEST_REWARD,
        metadata: {
          path: ['refId'],
          equals: submission.id,
        },
      },
      select: { id: true },
    });

    const isClaimed = !!walletTransaction;

    return {
      success: true,
      data: {
        isCompleted: isApproved,
        isClaimed,
        status: submission.status,
      },
    };
  }

  async getPendingSubmissionsForClassroom(
    classroomId: string,
    limit: number = 50,
  ) {
    // Get classroom with students
    const classroom = await this.prisma.classroom.findUnique({
      where: { id: classroomId },
      include: { students: { select: { studentId: true } } },
    });
    if (!classroom) {
      throw new NotFoundException('Classroom not found');
    }

    const studentIds = classroom.students.map((s) => s.studentId);

    // Get student profiles
    const profiles = await this.prisma.studentProfile.findMany({
      where: {
        userId: { in: studentIds },
        termId: classroom.termId,
      },
      select: {
        id: true,
        user: { select: { username: true } },
      },
    });

    const profileIds = profiles.map((p) => p.id);
    const userNameByProfileId = new Map(
      profiles.map((p) => [p.id, p.user.username]),
    );

    // Get pending submissions
    const submissions = await this.prisma.questSubmission.findMany({
      where: {
        status: QuestSubmissionStatus.PENDING,
        studentProfileId: { in: profileIds },
      },
      select: {
        id: true,
        createdAt: true,
        quest: {
          select: { title: true, deadlineAt: true },
        },
        studentProfileId: true,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    const submissionResults = submissions.map((s) => ({
      id: s.id,
      task_name: s.quest.title,
      student_name: userNameByProfileId.get(s.studentProfileId) || 'Unknown',
      submitted_at: s.createdAt.toISOString(),
      is_late: s.createdAt > (s.quest.deadlineAt || new Date()),
    }));

    // Also find pending quiz attempts that need manual grading (LONG_TEXT/FILE_UPLOAD)
    // or failed attempts for quests in this classroom
    const classroomQuests = await this.prisma.quest.findMany({
      where: {
        classrooms: { some: { classroomId } },
        quizId: { not: null },
        status: QuestStatus.PUBLISHED,
      },
      select: {
        id: true,
        title: true,
        quizId: true,
        deadlineAt: true,
      },
    });

    const pendingQuizItems: Array<{
      id: string;
      task_name: string;
      student_name: string;
      submitted_at: string;
      is_late: boolean;
    }> = [];

    for (const quest of classroomQuests) {
      if (!quest.quizId) continue;

      // Find latest submitted (but not yet auto-passed) attempts from students in this classroom
      const attempts = await this.prisma.quizAttempt.findMany({
        where: {
          quizId: quest.quizId,
          studentProfileId: { in: profileIds },
          submittedAt: { not: null },
          isPassed: false,
        },
        select: {
          id: true,
          studentProfileId: true,
          submittedAt: true,
          quiz: {
            select: {
              questions: {
                where: {
                  questionType: { in: ['LONG_TEXT', 'FILE_UPLOAD'] },
                },
                select: { id: true },
              },
            },
          },
        },
        orderBy: { submittedAt: 'desc' },
        // Only latest attempt per student
        distinct: ['studentProfileId'],
      });

      for (const attempt of attempts) {
        // Skip if already has a QuestSubmission for this quest+student
        const alreadyHasSubmission =
          await this.prisma.questSubmission.findUnique({
            where: {
              questId_studentProfileId: {
                questId: quest.id,
                studentProfileId: attempt.studentProfileId,
              },
            },
            select: { id: true },
          });

        if (alreadyHasSubmission) continue;

        // Only include if there are manual-graded questions
        if (attempt.quiz.questions.length === 0) continue;

        const submittedAt = attempt.submittedAt!;

        pendingQuizItems.push({
          id: `quiz-attempt:${attempt.id}`,
          task_name: quest.title,
          student_name:
            userNameByProfileId.get(attempt.studentProfileId) || 'Unknown',
          submitted_at: submittedAt.toISOString(),
          is_late: quest.deadlineAt ? submittedAt > quest.deadlineAt : false,
        });
      }
    }

    // Merge and sort by submitted_at desc
    const allResults = [...submissionResults, ...pendingQuizItems]
      .sort(
        (a, b) =>
          new Date(b.submitted_at).getTime() -
          new Date(a.submitted_at).getTime(),
      )
      .slice(0, limit);

    return allResults;
  }

  async claimQuestReward(questId: string, user: CurrentUser) {
    this.assertStudent(user);

    const quest = await this.ensureQuestMembership(questId, user.id);
    if (quest.status !== QuestStatus.PUBLISHED) {
      throw new BadRequestException('Quest is not published');
    }
    if (quest.rewardCoins <= 0) {
      throw new BadRequestException('Quest has no reward');
    }

    const studentProfile = await this.getStudentProfileInQuestTerm(
      quest,
      user.id,
    );

    if (quest.type === QuestType.QUIZ) {
      if (!quest.quizId) {
        throw new BadRequestException('Quiz quest is missing quizId');
      }

      const passedAttempt = await this.prisma.quizAttempt.findFirst({
        where: {
          quizId: quest.quizId,
          studentProfileId: studentProfile.id,
          isPassed: true,
        },
      });

      if (!passedAttempt) {
        throw new BadRequestException(
          'You must pass the quiz to claim the reward',
        );
      }

      // Check for manual questions
      const manualQuestionsCount = await this.prisma.quizQuestion.count({
        where: {
          quizId: quest.quizId,
          gradingType: 'MANUAL',
        },
      });

      if (manualQuestionsCount > 0) {
        throw new BadRequestException(
          'This quiz requires manual grading before reward can be claimed',
        );
      }
    } else if (quest.type === QuestType.INTERACTIVE) {
      // For interactive quests, the submission must already be APPROVED
      // (auto-approved via completeInteractiveQuest when the action is done)
      const submission = await this.prisma.questSubmission.findUnique({
        where: {
          questId_studentProfileId: {
            questId,
            studentProfileId: studentProfile.id,
          },
        },
      });

      if (!submission || submission.status !== QuestSubmissionStatus.APPROVED) {
        throw new BadRequestException(
          'Interactive quest must be completed before claiming the reward',
        );
      }
    } else {
      throw new BadRequestException(
        'Only QUIZ and INTERACTIVE quests can be claimed via this endpoint',
      );
    }

    return await this.prisma.$transaction(async (tx) => {
      const existingSubmission = await tx.questSubmission.findUnique({
        where: {
          questId_studentProfileId: {
            questId,
            studentProfileId: studentProfile.id,
          },
        },
      });

      // For interactive quests, the submission is already APPROVED from completeInteractiveQuest
      // Check if reward was already given by looking for a wallet transaction
      if (existingSubmission) {
        const existingTx = await tx.walletTransaction.findFirst({
          where: {
            type: TransactionType.QUEST_REWARD,
            metadata: {
              path: ['refId'],
              equals: existingSubmission.id,
            },
          },
          select: { id: true },
        });

        if (existingTx) {
          throw new BadRequestException('Reward already claimed');
        }

        // Submission exists (APPROVED for interactive, or any status for quiz)
        // Ensure it's APPROVED and reward it
        const submission = await tx.questSubmission.update({
          where: { id: existingSubmission.id },
          data: {
            status: QuestSubmissionStatus.APPROVED,
            rejectReason: null,
          },
        });

        await this.rewardQuestToWallet(
          tx,
          submission.id,
          studentProfile.id,
          quest,
        );

        return { success: true, data: submission };
      }

      // No submission exists yet (shouldn't happen for interactive, but handle for quiz)
      const submission = await tx.questSubmission.upsert({
        where: {
          questId_studentProfileId: {
            questId,
            studentProfileId: studentProfile.id,
          },
        },
        create: {
          questId,
          studentProfileId: studentProfile.id,
          status: QuestSubmissionStatus.APPROVED,
          latestVersionNo: 1,
        },
        update: {
          status: QuestSubmissionStatus.APPROVED,
          rejectReason: null,
        },
      });

      await this.rewardQuestToWallet(
        tx,
        submission.id,
        studentProfile.id,
        quest,
      );

      return { success: true, data: submission };
    });
  }
}
