import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { QuestStatus, QuestType } from '@prisma/client';
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
import { TeacherQuizQuestDraftDto } from './dto/teacher-quiz-quest.dto';
import type { CurrentUser } from 'src/common/types/current-user.type';
import { assertTeacherOrAdmin } from 'src/common/utils/role.utils';
import { QuestValidationService } from './services/quest-validation.service';
import { QuestQueryService } from './services/quest-query.service';
import { QuizManagementService } from './services/quiz-management.service';
import { QuestSubmissionService } from './services/quest-submission.service';
import { InteractiveQuestService } from './services/interactive-quest.service';

@Injectable()
export class QuestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly validationService: QuestValidationService,
    private readonly queryService: QuestQueryService,
    private readonly quizManagementService: QuizManagementService,
    private readonly submissionService: QuestSubmissionService,
    private readonly interactiveService: InteractiveQuestService,
  ) {}

  // --- Quest CRUD ---

  async createQuest(user: CurrentUser, dto: CreateQuestDto) {
    assertTeacherOrAdmin(user);

    const term = await this.prisma.term.findUnique({
      where: { id: dto.termId },
      select: { id: true },
    });
    if (!term) {
      throw new NotFoundException('Term not found');
    }

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

    await this.validationService.validateQuestQuizConsistency({
      type: dto.type,
      quizId: dto.quizId,
      termId: dto.termId,
    });
    await this.validationService.validateClassroomsInTerm(dto.classroomIds, dto.termId);

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

      await this.validationService.syncClassroomAssignments(tx, quest.id, dto.classroomIds);

      return tx.quest.findUnique({
        where: { id: quest.id },
        include: this.queryService.toQuestInclude(),
      });
    });

    return { success: true, data: created };
  }

  async updateQuest(questId: string, user: CurrentUser, dto: UpdateQuestDto) {
    assertTeacherOrAdmin(user);

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

    if (dto.parentId !== undefined) {
      if (dto.parentId !== null) {
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
    }

    await this.validationService.validateQuestQuizConsistency({
      type: nextType,
      quizId: nextQuizId,
      termId: nextTermId,
    });

    if (dto.classroomIds) {
      await this.validationService.validateClassroomsInTerm(dto.classroomIds, nextTermId);
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
        await this.validationService.syncClassroomAssignments(tx, questId, dto.classroomIds);
      }

      return tx.quest.findUnique({
        where: { id: questId },
        include: this.queryService.toQuestInclude(),
      });
    });

    return { success: true, data: updated };
  }

  async deleteQuest(questId: string, user: CurrentUser) {
    assertTeacherOrAdmin(user);

    const quest = await this.prisma.quest.findUnique({
      where: { id: questId },
      select: {
        id: true,
        status: true,
        createdById: true,
        _count: {
          select: {
            submissions: true,
          },
        },
      },
    });

    if (!quest) {
      throw new NotFoundException('Quest not found');
    }
    if (quest.createdById !== user.id) {
      throw new ForbiddenException('Only quest owner can delete this quest');
    }
    if (quest.status !== QuestStatus.DRAFT) {
      throw new BadRequestException('Only draft quests can be deleted');
    }
    if (quest._count.submissions > 0) {
      throw new BadRequestException('Quest with submissions cannot be deleted');
    }

    await this.prisma.quest.delete({ where: { id: questId } });
    return { success: true, data: { id: questId } };
  }

  async closeQuest(questId: string, user: CurrentUser) {
    assertTeacherOrAdmin(user);
    const quest = await this.prisma.quest.findUnique({
      where: { id: questId },
      select: { createdById: true },
    });
    if (!quest) {
      throw new NotFoundException('Quest not found');
    }
    if (quest.createdById !== user.id) {
      throw new ForbiddenException('Only quest owner can close this quest');
    }

    const updated = await this.prisma.quest.update({
      where: { id: questId },
      data: { status: QuestStatus.CLOSED },
      include: this.queryService.toQuestInclude(),
    });

    return { success: true, data: updated };
  }

  // --- Delegated methods ---

  createTeacherQuizDraft(user: CurrentUser, dto: TeacherQuizQuestDraftDto) {
    return this.quizManagementService.createTeacherQuizDraft(user, dto);
  }

  updateTeacherQuizDraft(questId: string, user: CurrentUser, dto: TeacherQuizQuestDraftDto) {
    return this.quizManagementService.updateTeacherQuizDraft(questId, user, dto);
  }

  publishQuest(questId: string, user: CurrentUser) {
    return this.quizManagementService.publishQuest(questId, user);
  }

  listQuests(query: ListQuestsQueryDto) {
    return this.queryService.listQuests(query);
  }

  getQuestById(questId: string, user?: CurrentUser) {
    return this.queryService.getQuestById(questId, user);
  }

  listMyQuests(user: CurrentUser, query: ListMyQuestsQueryDto) {
    return this.queryService.listMyQuests(user, query);
  }

  getMyQuestDetail(questId: string, user: CurrentUser) {
    return this.queryService.getMyQuestDetail(questId, user);
  }

  submitMyQuest(questId: string, user: CurrentUser, dto: SubmitQuestDto) {
    return this.submissionService.submitMyQuest(questId, user, dto);
  }

  getSubmissionDetail(submissionId: string) {
    return this.submissionService.getSubmissionDetail(submissionId);
  }

  approveSubmission(submissionId: string, user: CurrentUser, dto: ApproveSubmissionDto) {
    return this.submissionService.approveSubmission(submissionId, user, dto);
  }

  rejectSubmission(submissionId: string, user: CurrentUser, dto: RejectSubmissionDto) {
    return this.submissionService.rejectSubmission(submissionId, user, dto);
  }

  listQuestSubmissions(questId: string, user: CurrentUser, classroomId?: string) {
    return this.submissionService.listQuestSubmissions(questId, user, classroomId);
  }

  getMyQuestSubmissionStatus(questId: string, user: CurrentUser) {
    return this.submissionService.getMyQuestSubmissionStatus(questId, user);
  }

  getPendingSubmissionsForClassroom(classroomId: string, limit: number) {
    return this.submissionService.getPendingSubmissionsForClassroom(classroomId, limit);
  }

  completeInteractiveQuest(userId: string, actionType: string) {
    return this.interactiveService.completeInteractiveQuest(userId, actionType);
  }

  getInteractiveQuestStatus(questId: string, user: CurrentUser) {
    return this.interactiveService.getInteractiveQuestStatus(questId, user);
  }

  claimQuestReward(questId: string, user: CurrentUser) {
    return this.interactiveService.claimQuestReward(questId, user);
  }
}
