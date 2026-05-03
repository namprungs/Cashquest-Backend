import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  QuestStatus,
  QuestSubmissionStatus,
  QuestType,
  TransactionType,
} from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import type { CurrentUser } from 'src/common/types/current-user.type';
import { assertStudent } from 'src/common/utils/role.utils';
import { QuestQueryService } from './quest-query.service';
import { QuestSubmissionService } from './quest-submission.service';

@Injectable()
export class InteractiveQuestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queryService: QuestQueryService,
    private readonly submissionService: QuestSubmissionService,
  ) {}

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
            quest: {
              select: {
                id: true,
                title: true,
                type: true,
                description: true,
              },
            },
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

  async getInteractiveQuestStatus(questId: string, user: CurrentUser) {
    assertStudent(user);

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

  async claimQuestReward(questId: string, user: CurrentUser) {
    assertStudent(user);

    const quest = await this.queryService.ensureQuestMembership(questId, user.id);
    if (quest.status !== QuestStatus.PUBLISHED) {
      throw new BadRequestException('Quest is not published');
    }
    if (quest.rewardCoins <= 0) {
      throw new BadRequestException('Quest has no reward');
    }

    const studentProfile = await this.queryService.getStudentProfileInQuestTerm(
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

        const submission = await tx.questSubmission.update({
          where: { id: existingSubmission.id },
          data: {
            status: QuestSubmissionStatus.APPROVED,
            rejectReason: null,
          },
        });

        await this.submissionService.rewardQuestToWallet(
          tx,
          submission.id,
          studentProfile.id,
          quest,
        );

        return { success: true, data: submission };
      }

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

      await this.submissionService.rewardQuestToWallet(
        tx,
        submission.id,
        studentProfile.id,
        quest,
      );

      return { success: true, data: submission };
    });
  }

  private normalizeActionType(value: unknown) {
    return String(value ?? '')
      .trim()
      .replace(/[_\s-]+/g, '')
      .toUpperCase();
  }
}
