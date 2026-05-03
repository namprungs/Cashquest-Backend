import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  QuizGradingType,
  QuizQuestionType,
  QuestStatus,
  QuestType,
} from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import type { CurrentUser } from 'src/common/types/current-user.type';
import { assertTeacherOrAdmin } from 'src/common/utils/role.utils';
import { TeacherQuizQuestDraftDto, TeacherQuizDraftQuestionDto } from '../dto/teacher-quiz-quest.dto';
import { QuestValidationService } from './quest-validation.service';
import { QuestQueryService } from './quest-query.service';

const TEACHER_QUIZ_DRAFT_CONTENT_TYPE = 'TEACHER_QUIZ_DRAFT_V1';

@Injectable()
export class QuizManagementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly validationService: QuestValidationService,
    private readonly queryService: QuestQueryService,
  ) {}

  async createTeacherQuizDraft(
    user: CurrentUser,
    dto: TeacherQuizQuestDraftDto,
  ) {
    assertTeacherOrAdmin(user);

    const term = await this.prisma.term.findUnique({
      where: { id: dto.termId },
      select: { id: true },
    });
    if (!term) {
      throw new NotFoundException('Term not found');
    }
    await this.validationService.validateClassroomsInTerm(dto.classroomIds, dto.termId);

    const created = await this.prisma.$transaction(async (tx) => {
      const quest = await tx.quest.create({
        data: {
          termId: dto.termId,
          type: QuestType.QUIZ,
          title: (dto.title ?? '').trim() || 'ภารกิจแบบร่าง',
          description: dto.description,
          content: this.buildTeacherQuizDraftContent(dto),
          isSystem: false,
          rewardCoins: dto.rewardCoins ?? 0,
          difficulty: 'EASY',
          status: QuestStatus.DRAFT,
          deadlineAt: dto.deadlineAt,
          createdById: user.id,
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

  async updateTeacherQuizDraft(
    questId: string,
    user: CurrentUser,
    dto: TeacherQuizQuestDraftDto,
  ) {
    assertTeacherOrAdmin(user);

    const existing = await this.prisma.quest.findUnique({
      where: { id: questId },
      select: {
        id: true,
        type: true,
        status: true,
        quizId: true,
        createdById: true,
      },
    });

    if (!existing) {
      throw new NotFoundException('Quest not found');
    }
    if (existing.createdById !== user.id) {
      throw new ForbiddenException('Only quest owner can update this quest');
    }
    if (existing.type !== QuestType.QUIZ) {
      throw new BadRequestException('Only QUIZ quests can be edited here');
    }

    const term = await this.prisma.term.findUnique({
      where: { id: dto.termId },
      select: { id: true },
    });
    if (!term) {
      throw new NotFoundException('Term not found');
    }
    await this.validationService.validateClassroomsInTerm(dto.classroomIds, dto.termId);

    if (existing.status === QuestStatus.PUBLISHED) {
      this.validateTeacherQuizForPublish(dto);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      let quizId = existing.quizId;
      if (existing.status === QuestStatus.PUBLISHED) {
        quizId = await this.upsertTeacherQuizSnapshot(tx, quizId, dto);
      }

      await tx.quest.update({
        where: { id: questId },
        data: {
          termId: dto.termId,
          quizId,
          title: (dto.title ?? '').trim() || 'ภารกิจแบบร่าง',
          description: dto.description,
          content: this.buildTeacherQuizDraftContent(dto),
          rewardCoins: dto.rewardCoins ?? 0,
          deadlineAt: dto.deadlineAt,
        },
      });

      await this.validationService.syncClassroomAssignments(tx, questId, dto.classroomIds);

      return tx.quest.findUnique({
        where: { id: questId },
        include: this.queryService.toQuestInclude(),
      });
    });

    return { success: true, data: updated };
  }

  async publishQuest(questId: string, user: CurrentUser) {
    assertTeacherOrAdmin(user);

    const existing = await this.prisma.quest.findUnique({
      where: { id: questId },
      include: {
        classrooms: { select: { classroomId: true } },
      },
    });
    if (!existing) {
      throw new NotFoundException('Quest not found');
    }
    if (existing.createdById !== user.id) {
      throw new ForbiddenException('Only quest owner can publish this quest');
    }

    if (existing.type !== QuestType.QUIZ || existing.isSystem) {
      return this.updateQuestStatus(questId, QuestStatus.PUBLISHED);
    }

    const draft = this.queryService.parseTeacherQuizDraftContent(existing.content);
    const dto: TeacherQuizQuestDraftDto = {
      termId: existing.termId,
      classroomIds: existing.classrooms.map((row) => row.classroomId),
      title:
        (draft?.title as string | undefined) ??
        existing.title ??
        'ภารกิจแบบร่าง',
      description:
        (draft?.description as string | undefined) ??
        existing.description ??
        undefined,
      iconKey: (draft?.iconKey as string | undefined) ?? undefined,
      iconColorHex: (draft?.iconColorHex as string | undefined) ?? undefined,
      rewardCoins:
        typeof draft?.rewardCoins === 'number'
          ? draft.rewardCoins
          : existing.rewardCoins,
      deadlineAt:
        typeof draft?.deadlineAt === 'string' && draft.deadlineAt
          ? new Date(draft.deadlineAt)
          : (existing.deadlineAt ?? undefined),
      questions: Array.isArray(draft?.questions)
        ? (draft.questions as TeacherQuizDraftQuestionDto[])
        : [],
    };

    this.validateTeacherQuizForPublish(dto);

    const updated = await this.prisma.$transaction(async (tx) => {
      const quizId = await this.upsertTeacherQuizSnapshot(
        tx,
        existing.quizId,
        dto,
      );

      return tx.quest.update({
        where: { id: questId },
        data: {
          quizId,
          title: dto.title?.trim() || existing.title,
          description: dto.description,
          rewardCoins: dto.rewardCoins ?? 0,
          deadlineAt: dto.deadlineAt,
          status: QuestStatus.PUBLISHED,
        },
        include: this.queryService.toQuestInclude(),
      });
    });

    return { success: true, data: updated };
  }

  private buildTeacherQuizDraftContent(dto: TeacherQuizQuestDraftDto) {
    return JSON.stringify({
      type: TEACHER_QUIZ_DRAFT_CONTENT_TYPE,
      title: dto.title ?? '',
      description: dto.description ?? '',
      iconKey: dto.iconKey ?? '',
      iconColorHex: dto.iconColorHex ?? '',
      rewardCoins: dto.rewardCoins ?? 0,
      deadlineAt: dto.deadlineAt
        ? new Date(dto.deadlineAt).toISOString()
        : null,
      questions: dto.questions ?? [],
    });
  }

  private normalizeDraftQuestions(
    questions?: TeacherQuizDraftQuestionDto[],
  ): TeacherQuizDraftQuestionDto[] {
    return (questions ?? []).map((question) => {
      if (question.type === 'choice' && Array.isArray(question.choices)) {
        const validChoices = question.choices
          .map((choice, originalIndex) => ({
            choice: choice.trim(),
            originalIndex,
          }))
          .filter((item) => item.choice.length > 0);

        return {
          type: String(question.type ?? '').trim(),
          question: question.question ?? '',
          choices: validChoices.map((item) => item.choice),
          correctIndex: validChoices.findIndex(
            (item) => item.originalIndex === question.correctIndex,
          ),
        };
      }

      return {
        type: String(question.type ?? '').trim(),
        question: question.question ?? '',
        choices: undefined,
        correctIndex: question.correctIndex,
      };
    });
  }

  private validateTeacherQuizForPublish(dto: TeacherQuizQuestDraftDto) {
    const title = (dto.title ?? '').trim();
    if (!title) {
      throw new BadRequestException('กรุณากรอกชื่อภารกิจ');
    }

    const questions = this.normalizeDraftQuestions(dto.questions);
    if (!questions.length) {
      throw new BadRequestException('กรุณาเพิ่มคำถามอย่างน้อย 1 ข้อ');
    }

    questions.forEach((question, index) => {
      if (!String(question.question ?? '').trim()) {
        throw new BadRequestException(`กรุณากรอกคำถามที่ ${index + 1}`);
      }

      if (question.type === 'choice') {
        const choices = question.choices ?? [];
        if (choices.length < 2) {
          throw new BadRequestException(
            `คำถามที่ ${index + 1} ต้องมีตัวเลือกอย่างน้อย 2 ตัวเลือก`,
          );
        }
        if (
          question.correctIndex === undefined ||
          question.correctIndex < 0 ||
          question.correctIndex >= choices.length
        ) {
          throw new BadRequestException(
            `คำถามที่ ${index + 1} ต้องเลือกคำตอบที่ถูกต้อง`,
          );
        }
        return;
      }

      if (!['text', 'file'].includes(question.type)) {
        throw new BadRequestException(`ชนิดคำถามที่ ${index + 1} ไม่ถูกต้อง`);
      }
    });
  }

  private toQuizQuestionCreateInput(
    question: TeacherQuizDraftQuestionDto,
    index: number,
  ) {
    if (question.type === 'choice') {
      const choices = (question.choices ?? []).filter(Boolean);
      return {
        questionText: question.question?.trim() ?? '',
        questionType: QuizQuestionType.SINGLE_CHOICE,
        orderNo: index + 1,
        points: 1,
        gradingType: QuizGradingType.AUTO,
        answerKey: Prisma.JsonNull,
        config: Prisma.JsonNull,
        choices: {
          create: choices.map((choiceText, choiceIndex) => ({
            choiceText,
            isCorrect: choiceIndex === question.correctIndex,
            orderNo: choiceIndex + 1,
          })),
        },
      };
    }

    return {
      questionText: question.question?.trim() ?? '',
      questionType:
        question.type === 'file'
          ? QuizQuestionType.FILE_UPLOAD
          : QuizQuestionType.SHORT_TEXT,
      orderNo: index + 1,
      points: 1,
      gradingType: QuizGradingType.MANUAL,
      answerKey: Prisma.JsonNull,
      config: Prisma.JsonNull,
    };
  }

  private async upsertTeacherQuizSnapshot(
    tx: Prisma.TransactionClient,
    quizId: string | null,
    dto: TeacherQuizQuestDraftDto,
  ) {
    const questions = this.normalizeDraftQuestions(dto.questions);
    if (quizId) {
      const attemptCount = await tx.quizAttempt.count({ where: { quizId } });
      if (attemptCount > 0) {
        throw new BadRequestException(
          'Quiz already has attempts. Editing questions is not allowed.',
        );
      }
    }

    const quiz = quizId
      ? await tx.quiz.update({
          where: { id: quizId },
          data: {
            passAllRequired: false,
            timeLimitSec: null,
          },
          select: { id: true },
        })
      : await tx.quiz.create({
          data: {
            passAllRequired: false,
            timeLimitSec: null,
          },
          select: { id: true },
        });

    await tx.quizQuestion.deleteMany({ where: { quizId: quiz.id } });

    for (const [index, question] of questions.entries()) {
      await tx.quizQuestion.create({
        data: {
          quizId: quiz.id,
          ...this.toQuizQuestionCreateInput(question, index),
        },
      });
    }

    return quiz.id;
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
      include: this.queryService.toQuestInclude(),
    });

    return { success: true, data: updated };
  }
}
