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
} from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import type { CurrentUser } from 'src/common/types/current-user.type';
import { assertTeacherOrAdmin, assertStudent } from 'src/common/utils/role.utils';
import { SubmitQuestDto } from '../dto/submit-quest.dto';
import {
  ApproveSubmissionDto,
  ApproveSubmissionQuestionReviewDto,
  RejectSubmissionDto,
} from '../dto/review-submission.dto';
import { RandomExpenseService } from '../../random-expense/services/random-expense.service';
import { QuestQueryService } from './quest-query.service';

@Injectable()
export class QuestSubmissionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly randomExpenseService: RandomExpenseService,
    private readonly queryService: QuestQueryService,
  ) {}

  async submitMyQuest(questId: string, user: CurrentUser, dto: SubmitQuestDto) {
    assertStudent(user);

    const quest = await this.queryService.ensureQuestMembership(questId, user.id);
    if (quest.type === QuestType.QUIZ && quest.isSystem) {
      throw new BadRequestException(
        'QUIZ quest submission must be done via quiz attempts',
      );
    }
    if (quest.status !== QuestStatus.PUBLISHED) {
      throw new BadRequestException('Quest is not open for submission');
    }

    const studentProfile = await this.queryService.getStudentProfileInQuestTerm(
      quest,
      user.id,
    );
    const fileUrl = this.getSubmissionFileUrl(dto);

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
              fileUrl,
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
            reviewedById: null,
            fileUrl,
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

  async getSubmissionDetail(submissionId: string) {
    const submission = await this.prisma.questSubmission.findUnique({
      where: { id: submissionId },
      select: {
        id: true,
        status: true,
        latestVersionNo: true,
        fileUrl: true,
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
      ? (latestVersion?.createdAt ?? submission.createdAt) >
        submission.quest.deadlineAt
      : false;

    let quizData: unknown = null;
    if (submission.quest.type === 'QUIZ' && submission.quest.quizId) {
      const quizId = submission.quest.quizId;

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

      const questions = await this.prisma.quizQuestion.findMany({
        where: { quizId },
        include: { choices: true },
        orderBy: { orderNo: 'asc' },
      });

      const choiceIdsByQuestion = new Map<string, string[]>();
      const answerByQuestionId = new Map<
        string,
        {
          answerText?: string | null;
          answerNumber?: Prisma.Decimal | number | null;
          attachmentUrl?: string | null;
          isCorrect?: boolean | null;
          awardedPoints?: number | null;
        }
      >();

      if (latestAttempt) {
        const answers = await this.prisma.quizAttemptAnswer.findMany({
          where: { attemptId: latestAttempt.id },
        });

        const answerChoices =
          await this.prisma.quizAttemptAnswerChoice.findMany({
            where: { attemptId: latestAttempt.id },
            select: { questionId: true, choiceId: true },
          });

        for (const ac of answerChoices) {
          const list = choiceIdsByQuestion.get(ac.questionId) ?? [];
          list.push(ac.choiceId);
          choiceIdsByQuestion.set(ac.questionId, list);
        }

        for (const answer of answers) {
          answerByQuestionId.set(answer.questionId, answer);
        }
      } else {
        const payload =
          latestVersion?.payloadJson &&
          typeof latestVersion.payloadJson === 'object' &&
          !Array.isArray(latestVersion.payloadJson)
            ? (latestVersion.payloadJson as Record<string, unknown>)
            : null;
        const payloadAnswers = Array.isArray(payload?.answers)
          ? payload.answers
          : [];

        for (const rawAnswer of payloadAnswers) {
          if (
            !rawAnswer ||
            typeof rawAnswer !== 'object' ||
            Array.isArray(rawAnswer)
          ) {
            continue;
          }

          const answer = rawAnswer as Record<string, unknown>;
          const questionId = String(answer.questionId ?? '');
          if (!questionId) {
            continue;
          }

          const selectedChoiceIds = Array.isArray(answer.selectedChoiceIds)
            ? answer.selectedChoiceIds
                .map((choiceId) => String(choiceId))
                .filter((choiceId) => choiceId.length > 0)
            : [];
          choiceIdsByQuestion.set(questionId, selectedChoiceIds);
          answerByQuestionId.set(questionId, {
            answerText:
              answer.answerText !== undefined && answer.answerText !== null
                ? String(answer.answerText)
                : null,
            answerNumber:
              typeof answer.answerNumber === 'number'
                ? answer.answerNumber
                : null,
            attachmentUrl:
              answer.attachmentUrl !== undefined &&
              answer.attachmentUrl !== null
                ? String(answer.attachmentUrl)
                : null,
            isCorrect:
              typeof answer.isCorrect === 'boolean' ? answer.isCorrect : null,
            awardedPoints:
              typeof answer.awardedPoints === 'number'
                ? answer.awardedPoints
                : null,
          });
        }
      }

      if (latestAttempt || answerByQuestionId.size > 0) {
        quizData = {
          attemptId: latestAttempt?.id ?? null,
          attemptScore: latestAttempt?.score ?? 0,
          isPassed: latestAttempt?.isPassed ?? false,
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
        fileUrl: submission.fileUrl,
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
    assertTeacherOrAdmin(user);

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
        versions: {
          orderBy: { versionNo: 'desc' },
          take: 1,
          select: {
            id: true,
            payloadJson: true,
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

    const updated = await this.prisma.$transaction(async (tx) => {
      const latestVersion = submission.versions[0];
      const reviewedPayload = latestVersion
        ? this.applySubmissionQuestionReviews(
            latestVersion.payloadJson,
            dto.questionReviews,
          )
        : undefined;

      if (latestVersion && reviewedPayload !== undefined) {
        await tx.questSubmissionVersion.update({
          where: { id: latestVersion.id },
          data: {
            payloadJson: reviewedPayload,
          },
        });
      }

      return this.approveSubmissionAndReward(tx, {
        submissionId,
        studentProfileId: submission.studentProfileId,
        quest: submission.quest,
        reviewedById: user.id,
      });
    });

    return { success: true, data: updated };
  }

  async rejectSubmission(
    submissionId: string,
    user: CurrentUser,
    dto: RejectSubmissionDto,
  ) {
    assertTeacherOrAdmin(user);

    const submission = await this.prisma.questSubmission.findUnique({
      where: { id: submissionId },
      select: {
        id: true,
        status: true,
        updatedAt: true,
        studentProfileId: true,
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

  async listQuestSubmissions(
    questId: string,
    user: CurrentUser,
    classroomId?: string,
  ) {
    assertTeacherOrAdmin(user);

    const quest = await this.prisma.quest.findUnique({
      where: { id: questId },
      select: {
        id: true,
        title: true,
        deadlineAt: true,
        rewardCoins: true,
        createdById: true,
        quizId: true,
      },
    });

    if (!quest) {
      throw new NotFoundException('Quest not found');
    }
    if (quest.createdById !== user.id) {
      throw new ForbiddenException(
        'Only quest owner can view submissions for this quest',
      );
    }

    const submissions = await this.prisma.questSubmission.findMany({
      where: {
        questId,
        ...(classroomId
          ? {
              studentProfile: {
                user: {
                  classroomStudents: {
                    some: { classroomId },
                  },
                },
              },
            }
          : {}),
      },
      select: {
        id: true,
        status: true,
        studentProfile: {
          select: {
            user: {
              select: {
                id: true,
                username: true,
                email: true,
              },
            },
          },
        },
        versions: {
          orderBy: { versionNo: 'desc' },
          take: 1,
          select: {
            createdAt: true,
            payloadJson: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const maxScore = quest.quizId
      ? ((
          await this.prisma.quizQuestion.aggregate({
            where: { quizId: quest.quizId },
            _sum: { points: true },
          })
        )._sum.points ?? 0)
      : 0;

    const latestAttempts = quest.quizId
      ? await this.prisma.quizAttempt.findMany({
          where: {
            quizId: quest.quizId,
            ...(classroomId
              ? {
                  studentProfile: {
                    user: {
                      classroomStudents: {
                        some: { classroomId },
                      },
                    },
                  },
                }
              : {}),
            submittedAt: { not: null },
          },
          select: {
            id: true,
            score: true,
            submittedAt: true,
            studentProfile: {
              select: {
                user: {
                  select: {
                    id: true,
                    username: true,
                    email: true,
                  },
                },
              },
            },
          },
          orderBy: { submittedAt: 'desc' },
        })
      : [];

    const rowsByUserId = new Map<string, Record<string, unknown>>();

    for (const submission of submissions) {
      const submittedAt = submission.versions[0]?.createdAt;
      const payload = submission.versions[0]?.payloadJson;
      const payloadScore =
        payload &&
        typeof payload === 'object' &&
        !Array.isArray(payload) &&
        Array.isArray((payload as Record<string, unknown>).answers)
          ? (
              (payload as Record<string, unknown>).answers as unknown[]
            ).reduce<number>((sum, rawAnswer) => {
              if (
                !rawAnswer ||
                typeof rawAnswer !== 'object' ||
                Array.isArray(rawAnswer)
              ) {
                return sum;
              }

              const awardedPoints = Number(
                (rawAnswer as Record<string, unknown>).awardedPoints ?? 0,
              );
              return Number.isFinite(awardedPoints) ? sum + awardedPoints : sum;
            }, 0)
          : null;
      const userInfo = submission.studentProfile.user;
      rowsByUserId.set(userInfo.id, {
        submissionId: submission.id,
        studentName: userInfo.username,
        studentCode: userInfo.email,
        submittedAt: submittedAt?.toISOString() ?? null,
        status:
          submission.status === QuestSubmissionStatus.APPROVED
            ? 'checked'
            : submittedAt && quest.deadlineAt && submittedAt > quest.deadlineAt
              ? 'late'
              : 'pending',
        score:
          submission.status === QuestSubmissionStatus.APPROVED
            ? payloadScore
            : null,
      });
    }

    for (const attempt of latestAttempts) {
      const userInfo = attempt.studentProfile.user;
      if (rowsByUserId.has(userInfo.id)) {
        const existing = rowsByUserId.get(userInfo.id)!;
        existing.score = attempt.score;
        continue;
      }
      rowsByUserId.set(userInfo.id, {
        submissionId: '',
        studentName: userInfo.username,
        studentCode: userInfo.email,
        submittedAt: attempt.submittedAt?.toISOString() ?? null,
        status:
          attempt.submittedAt &&
          quest.deadlineAt &&
          attempt.submittedAt > quest.deadlineAt
            ? 'late'
            : 'checked',
        score: attempt.score,
      });
    }

    return {
      success: true,
      data: {
        quest: {
          id: quest.id,
          title: quest.title,
          rewardCoins: quest.rewardCoins,
          deadlineAt: quest.deadlineAt,
          maxScore,
        },
        submissions: Array.from(rowsByUserId.values()),
      },
    };
  }

  async getMyQuestSubmissionStatus(questId: string, user: CurrentUser) {
    assertStudent(user);

    const quest = await this.queryService.ensureQuestMembership(questId, user.id);
    const studentProfile = await this.queryService.getStudentProfileInQuestTerm(
      quest,
      user.id,
    );

    const submission = await this.prisma.questSubmission.findUnique({
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
        rejectReason: true,
        versions: {
          orderBy: { versionNo: 'desc' },
          take: 1,
          select: {
            payloadJson: true,
            attachmentUrl: true,
            createdAt: true,
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
          status: '',
          latestVersionNo: 0,
          rejectReason: null,
          latestPayloadJson: null,
          latestAttachmentUrl: null,
          latestSubmittedAt: null,
        },
      };
    }

    const walletTransaction = await this.prisma.walletTransaction.findFirst({
      where: {
        wallet: {
          studentProfileId: studentProfile.id,
        },
        type: TransactionType.QUEST_REWARD,
        metadata: {
          path: ['refId'],
          equals: submission.id,
        },
      },
      select: { id: true },
    });

    const isApproved = submission.status === QuestSubmissionStatus.APPROVED;

    return {
      success: true,
      data: {
        isCompleted: isApproved,
        isClaimed: !!walletTransaction,
        status: submission.status,
        latestVersionNo: submission.latestVersionNo,
        rejectReason: submission.rejectReason,
        latestPayloadJson: submission.versions[0]?.payloadJson ?? null,
        latestAttachmentUrl: submission.versions[0]?.attachmentUrl ?? null,
        latestSubmittedAt: submission.versions[0]?.createdAt ?? null,
      },
    };
  }

  async getPendingSubmissionsForClassroom(
    classroomId: string,
    limit: number = 50,
  ) {
    const classroom = await this.prisma.classroom.findUnique({
      where: { id: classroomId },
      include: { students: { select: { studentId: true } } },
    });
    if (!classroom) {
      throw new NotFoundException('Classroom not found');
    }

    const studentIds = classroom.students.map((s) => s.studentId);

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

    const submissions = await this.prisma.questSubmission.findMany({
      where: {
        status: QuestSubmissionStatus.PENDING,
        studentProfileId: { in: profileIds },
      },
      select: {
        id: true,
        createdAt: true,
        updatedAt: true,
        quest: {
          select: { title: true, deadlineAt: true },
        },
        studentProfileId: true,
        versions: {
          orderBy: { versionNo: 'desc' },
          take: 1,
          select: {
            createdAt: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
    });

    const submissionResults = submissions.map((s) => {
      const submittedAt = s.versions[0]?.createdAt ?? s.updatedAt;
      return {
        id: s.id,
        task_name: s.quest.title,
        student_name: userNameByProfileId.get(s.studentProfileId) || 'Unknown',
        submitted_at: submittedAt.toISOString(),
        is_late: s.quest.deadlineAt ? submittedAt > s.quest.deadlineAt : false,
      };
    });

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
        distinct: ['studentProfileId'],
      });

      for (const attempt of attempts) {
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

    const allResults = [...submissionResults, ...pendingQuizItems]
      .sort(
        (a, b) =>
          new Date(b.submitted_at).getTime() -
          new Date(a.submitted_at).getTime(),
      )
      .slice(0, limit);

    return allResults;
  }

  // --- Reward helpers (used by InteractiveQuestService too) ---

  async rewardQuestToWallet(
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

    await this.randomExpenseService.autoPayPendingExpensesFromWalletTx(
      tx,
      studentProfileId,
    );
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

  private getSubmissionFileUrl(dto: SubmitQuestDto) {
    if (dto.attachmentUrl?.trim()) {
      return dto.attachmentUrl.trim();
    }

    const payload =
      dto.payloadJson &&
      typeof dto.payloadJson === 'object' &&
      !Array.isArray(dto.payloadJson)
        ? (dto.payloadJson as Record<string, unknown>)
        : null;
    const answers = Array.isArray(payload?.answers) ? payload.answers : [];

    for (const rawAnswer of answers) {
      if (
        !rawAnswer ||
        typeof rawAnswer !== 'object' ||
        Array.isArray(rawAnswer)
      ) {
        continue;
      }

      const attachmentUrl = (rawAnswer as Record<string, unknown>)
        .attachmentUrl;
      if (typeof attachmentUrl === 'string' && attachmentUrl.trim()) {
        return attachmentUrl.trim();
      }
    }

    return null;
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

  private applySubmissionQuestionReviews(
    payloadJson: Prisma.JsonValue | null,
    questionReviews: ApproveSubmissionQuestionReviewDto[] | undefined,
  ): Prisma.InputJsonValue | undefined {
    if (!questionReviews?.length) {
      return undefined;
    }

    if (
      !payloadJson ||
      typeof payloadJson !== 'object' ||
      Array.isArray(payloadJson)
    ) {
      return undefined;
    }

    const payload = payloadJson as Record<string, unknown>;
    const answers = Array.isArray(payload.answers) ? payload.answers : null;
    if (!answers) {
      return undefined;
    }

    const reviewByQuestionId = new Map(
      questionReviews.map((review) => [review.questionId, review]),
    );

    const nextAnswers = answers.map((rawAnswer) => {
      if (
        !rawAnswer ||
        typeof rawAnswer !== 'object' ||
        Array.isArray(rawAnswer)
      ) {
        return rawAnswer;
      }

      const answer = rawAnswer as Record<string, unknown>;
      const questionId = String(answer.questionId ?? '');
      const review = reviewByQuestionId.get(questionId);

      if (!review) {
        return answer;
      }

      return {
        ...answer,
        isCorrect: review.isCorrect,
        awardedPoints: review.awardedPoints ?? (review.isCorrect ? 1 : 0),
      };
    });

    const totalScore = nextAnswers.reduce((sum, rawAnswer) => {
      if (
        !rawAnswer ||
        typeof rawAnswer !== 'object' ||
        Array.isArray(rawAnswer)
      ) {
        return sum;
      }

      const awardedPoints = Number(
        (rawAnswer as Record<string, unknown>).awardedPoints ?? 0,
      );
      return Number.isFinite(awardedPoints) ? sum + awardedPoints : sum;
    }, 0);

    return {
      ...payload,
      answers: nextAnswers,
      totalScore,
      reviewedAt: new Date().toISOString(),
    } as Prisma.InputJsonValue;
  }
}
