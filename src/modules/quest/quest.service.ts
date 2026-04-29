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
  ApproveSubmissionQuestionReviewDto,
  RejectSubmissionDto,
} from './dto/review-submission.dto';
import {
  TeacherQuizDraftQuestionDto,
  TeacherQuizQuestDraftDto,
} from './dto/teacher-quiz-quest.dto';
type CurrentUser = User & { role?: { name?: string } | null };

const TEACHER_QUIZ_DRAFT_CONTENT_TYPE = 'TEACHER_QUIZ_DRAFT_V1';

@Injectable()
export class QuestService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeActionType(value: unknown) {
    return String(value ?? '')
      .trim()
      .replace(/[_\s-]+/g, '')
      .toUpperCase();
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

  private parseTeacherQuizDraftContent(content?: string | null) {
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

  async createTeacherQuizDraft(
    user: CurrentUser,
    dto: TeacherQuizQuestDraftDto,
  ) {
    this.assertTeacherOrAdmin(user);

    const term = await this.prisma.term.findUnique({
      where: { id: dto.termId },
      select: { id: true },
    });
    if (!term) {
      throw new NotFoundException('Term not found');
    }
    await this.validateClassroomsInTerm(dto.classroomIds, dto.termId);

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

  async updateTeacherQuizDraft(
    questId: string,
    user: CurrentUser,
    dto: TeacherQuizQuestDraftDto,
  ) {
    this.assertTeacherOrAdmin(user);

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
    await this.validateClassroomsInTerm(dto.classroomIds, dto.termId);

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

      return tx.quest.findUnique({
        where: { id: questId },
        include: this.toQuestInclude(),
      });
    });

    return { success: true, data: updated };
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
      const roleName = this.getRoleName(user);
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

  async publishQuest(questId: string, user: CurrentUser) {
    this.assertTeacherOrAdmin(user);

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

    const draft = this.parseTeacherQuizDraftContent(existing.content);
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
        include: this.toQuestInclude(),
      });
    });

    return { success: true, data: updated };
  }

  async closeQuest(questId: string, user: CurrentUser) {
    this.assertTeacherOrAdmin(user);
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

  async deleteQuest(questId: string, user: CurrentUser) {
    this.assertTeacherOrAdmin(user);

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

  async listQuestSubmissions(
    questId: string,
    user: CurrentUser,
    classroomId?: string,
  ) {
    this.assertTeacherOrAdmin(user);

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
    return this.fetchMyQuests(user, query);
  }

  private async fetchMyQuests(user: CurrentUser, query: ListMyQuestsQueryDto) {
    const roleName = this.getRoleName(user);

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

    this.assertStudent(user);

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

    const approvedSubmissions = studentProfileIds.length
      ? await this.prisma.questSubmission.findMany({
          where: {
            studentProfileId: { in: studentProfileIds },
            questId: { in: [...questIds] },
            status: QuestSubmissionStatus.APPROVED,
          },
          select: { questId: true },
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
      approvedSubmissions.map((submission) => submission.questId),
    );
    const completedQuizIds = new Set(
      passedAttempts.map((attempt) => attempt.quizId),
    );
    const isQuestCompleted = (quest: (typeof quests)[number]) =>
      completedQuestIds.has(quest.id) ||
      (!!quest.quizId && completedQuizIds.has(quest.quizId));

    const questsWithCompletion = quests.map((quest) => ({
      ...quest,
      isCompleted: isQuestCompleted(quest),
      children: (quest.children ?? []).map((child) => ({
        ...child,
        isCompleted:
          completedQuestIds.has(child.id) ||
          (!!child.quizId && completedQuizIds.has(child.quizId)),
      })),
    }));

    return { success: true, data: questsWithCompletion };
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

        // If submission already exists and is APPROVED, don't allow editing
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
    this.assertTeacherOrAdmin(user);

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

  async getMyQuestSubmissionStatus(questId: string, user: CurrentUser) {
    this.assertStudent(user);

    const quest = await this.ensureQuestMembership(questId, user.id);
    const studentProfile = await this.getStudentProfileInQuestTerm(
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
