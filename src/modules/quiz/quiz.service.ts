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
  type User,
} from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateQuizSnapshotDto } from './dto/create-quiz-snapshot.dto';
import { UpdateQuizSnapshotDto } from './dto/update-quiz-snapshot.dto';
import { ListQuizzesQueryDto } from './dto/list-quizzes-query.dto';
import { SubmitAttemptDto } from './dto/submit-attempt.dto';

type QuizQuestionWithChoices = Prisma.QuizQuestionGetPayload<{
  include: { choices: true };
}>;

type CurrentUser = User & { role?: { name?: string } | null };

@Injectable()
export class QuizService {
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

  private validateSnapshotPayload(
    dto: CreateQuizSnapshotDto | UpdateQuizSnapshotDto,
  ) {
    const questionOrder = new Set<number>();
    const questionIds = new Set<string>();

    for (const question of dto.questions) {
      if (questionOrder.has(question.orderNo)) {
        throw new BadRequestException(
          'Duplicate question orderNo is not allowed',
        );
      }
      questionOrder.add(question.orderNo);

      if (question.id) {
        if (questionIds.has(question.id)) {
          throw new BadRequestException('Duplicate question id in payload');
        }
        questionIds.add(question.id);
      }

      const choiceOrder = new Set<number>();
      const choiceIds = new Set<string>();
      for (const choice of question.choices ?? []) {
        if (choiceOrder.has(choice.orderNo)) {
          throw new BadRequestException(
            'Duplicate choice orderNo is not allowed',
          );
        }
        choiceOrder.add(choice.orderNo);

        if (choice.id) {
          if (choiceIds.has(choice.id)) {
            throw new BadRequestException('Duplicate choice id in payload');
          }
          choiceIds.add(choice.id);
        }
      }
    }
  }

  async createQuizSnapshot(user: CurrentUser, dto: CreateQuizSnapshotDto) {
    this.assertTeacherOrAdmin(user);
    this.validateSnapshotPayload(dto);

    if (dto.moduleId) {
      const module = await this.prisma.learningModule.findUnique({
        where: { id: dto.moduleId },
        select: { id: true },
      });
      if (!module) {
        throw new NotFoundException('Learning module not found');
      }
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const quiz = await tx.quiz.create({
        data: {
          moduleId: dto.moduleId,
          timeLimitSec: dto.timeLimitSec,
          passAllRequired: dto.passAllRequired,
        },
      });

      for (const question of dto.questions) {
        await tx.quizQuestion.create({
          data: {
            quizId: quiz.id,
            questionText: question.questionText,
            questionType: question.questionType,
            orderNo: question.orderNo,
            points: question.points,
            gradingType: question.gradingType,
            answerKey:
              (question.answerKey as Prisma.InputJsonValue) ?? Prisma.JsonNull,
            config:
              (question.config as Prisma.InputJsonValue) ?? Prisma.JsonNull,
            choices: question.choices?.length
              ? {
                  create: question.choices.map((choice) => ({
                    choiceText: choice.choiceText,
                    isCorrect: choice.isCorrect,
                    orderNo: choice.orderNo,
                  })),
                }
              : undefined,
          },
        });
      }

      return tx.quiz.findUnique({
        where: { id: quiz.id },
        include: {
          questions: {
            orderBy: { orderNo: 'asc' },
            include: { choices: { orderBy: { orderNo: 'asc' } } },
          },
        },
      });
    });

    return { success: true, data: created };
  }

  async updateQuizSnapshot(
    quizId: string,
    user: CurrentUser,
    dto: UpdateQuizSnapshotDto,
  ) {
    this.assertTeacherOrAdmin(user);
    this.validateSnapshotPayload(dto);

    const existing = await this.prisma.quiz.findUnique({
      where: { id: quizId },
      include: {
        questions: {
          include: { choices: true },
        },
        _count: { select: { attempts: true } },
      },
    });

    if (!existing) {
      throw new NotFoundException('Quiz not found');
    }

    if (dto.moduleId) {
      const module = await this.prisma.learningModule.findUnique({
        where: { id: dto.moduleId },
        select: { id: true },
      });
      if (!module) {
        throw new NotFoundException('Learning module not found');
      }
    }

    const hasAttempts = existing._count.attempts > 0;
    const payloadQuestionIds = new Set(
      dto.questions.filter((q) => q.id).map((q) => q.id as string),
    );

    if (hasAttempts) {
      const hasDeletedQuestion = existing.questions.some(
        (q) => !payloadQuestionIds.has(q.id),
      );
      if (hasDeletedQuestion) {
        throw new BadRequestException(
          'Quiz already has attempts. Deleting questions/choices is not allowed.',
        );
      }

      for (const payloadQuestion of dto.questions) {
        if (!payloadQuestion.id) {
          continue;
        }
        const existingQuestion = existing.questions.find(
          (q) => q.id === payloadQuestion.id,
        );
        if (!existingQuestion) {
          throw new BadRequestException('Question id is invalid for this quiz');
        }

        const payloadChoiceIds = new Set(
          payloadQuestion.choices
            .filter((c) => c.id)
            .map((c) => c.id as string),
        );
        const hasDeletedChoice = existingQuestion.choices.some(
          (c) => !payloadChoiceIds.has(c.id),
        );
        if (hasDeletedChoice) {
          throw new BadRequestException(
            'Quiz already has attempts. Deleting questions/choices is not allowed.',
          );
        }
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.quiz.update({
        where: { id: quizId },
        data: {
          moduleId: dto.moduleId,
          timeLimitSec: dto.timeLimitSec,
          passAllRequired: dto.passAllRequired,
        },
      });

      const persistedQuestionIds: string[] = [];

      for (const question of dto.questions) {
        let questionId = question.id;

        if (questionId) {
          const match = await tx.quizQuestion.findFirst({
            where: { id: questionId, quizId },
            select: { id: true },
          });
          if (!match) {
            throw new BadRequestException(
              'Question id is invalid for this quiz',
            );
          }

          await tx.quizQuestion.update({
            where: { id: questionId },
            data: {
              questionText: question.questionText,
              questionType: question.questionType,
              orderNo: question.orderNo,
              points: question.points,
              gradingType: question.gradingType,
              answerKey:
                (question.answerKey as Prisma.InputJsonValue) ??
                Prisma.JsonNull,
              config:
                (question.config as Prisma.InputJsonValue) ?? Prisma.JsonNull,
            },
          });
        } else {
          const createdQuestion = await tx.quizQuestion.create({
            data: {
              quizId,
              questionText: question.questionText,
              questionType: question.questionType,
              orderNo: question.orderNo,
              points: question.points,
              gradingType: question.gradingType,
              answerKey:
                (question.answerKey as Prisma.InputJsonValue) ??
                Prisma.JsonNull,
              config:
                (question.config as Prisma.InputJsonValue) ?? Prisma.JsonNull,
            },
            select: { id: true },
          });
          questionId = createdQuestion.id;
        }

        persistedQuestionIds.push(questionId);
        const persistedChoiceIds: string[] = [];

        for (const choice of question.choices ?? []) {
          if (choice.id) {
            const choiceMatch = await tx.quizChoice.findFirst({
              where: { id: choice.id, questionId },
              select: { id: true },
            });
            if (!choiceMatch) {
              throw new BadRequestException(
                'Choice id is invalid for this question',
              );
            }

            await tx.quizChoice.update({
              where: { id: choice.id },
              data: {
                choiceText: choice.choiceText,
                isCorrect: choice.isCorrect,
                orderNo: choice.orderNo,
              },
            });
            persistedChoiceIds.push(choice.id);
          } else {
            const createdChoice = await tx.quizChoice.create({
              data: {
                questionId,
                choiceText: choice.choiceText,
                isCorrect: choice.isCorrect,
                orderNo: choice.orderNo,
              },
              select: { id: true },
            });
            persistedChoiceIds.push(createdChoice.id);
          }
        }

        if (!hasAttempts) {
          await tx.quizChoice.deleteMany({
            where: {
              questionId,
              ...(persistedChoiceIds.length
                ? { id: { notIn: persistedChoiceIds } }
                : {}),
            },
          });
        }
      }

      if (!hasAttempts) {
        await tx.quizQuestion.deleteMany({
          where: {
            quizId,
            ...(persistedQuestionIds.length
              ? { id: { notIn: persistedQuestionIds } }
              : {}),
          },
        });
      }

      return tx.quiz.findUnique({
        where: { id: quizId },
        include: {
          questions: {
            orderBy: { orderNo: 'asc' },
            include: { choices: { orderBy: { orderNo: 'asc' } } },
          },
        },
      });
    });

    return { success: true, data: updated };
  }

  async listQuizzes(query: ListQuizzesQueryDto) {
    const where: Prisma.QuizWhereInput = {
      ...(query.moduleId ? { moduleId: query.moduleId } : {}),
      ...(query.search
        ? {
            OR: [
              {
                questions: {
                  some: {
                    questionText: {
                      contains: query.search,
                      mode: 'insensitive',
                    },
                  },
                },
              },
            ],
          }
        : {}),
      ...(query.termId ? { module: { is: { termId: query.termId } } } : {}),
    };

    const quizzes = await this.prisma.quiz.findMany({
      where,
      include: {
        module: {
          select: { id: true, title: true, termId: true },
        },
        questions: {
          orderBy: { orderNo: 'asc' },
          include: {
            choices: {
              orderBy: { orderNo: 'asc' },
            },
          },
        },
        _count: {
          select: {
            questions: true,
            attempts: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return { success: true, data: quizzes };
  }

  async getQuizById(quizId: string) {
    const quiz = await this.prisma.quiz.findUnique({
      where: { id: quizId },
      include: {
        module: {
          select: { id: true, title: true, termId: true },
        },
        questions: {
          orderBy: { orderNo: 'asc' },
          include: {
            choices: {
              orderBy: { orderNo: 'asc' },
            },
          },
        },
      },
    });

    if (!quiz) {
      throw new NotFoundException('Quiz not found');
    }

    return { success: true, data: quiz };
  }

  async getQuizForStudent(quizId: string, user: CurrentUser) {
    this.assertStudent(user);

    const quiz = await this.prisma.quiz.findUnique({
      where: { id: quizId },
      include: {
        module: {
          select: { id: true, title: true, termId: true },
        },
        questions: {
          orderBy: { orderNo: 'asc' },
          include: {
            choices: {
              orderBy: { orderNo: 'asc' },
            },
          },
        },
      },
    });

    if (!quiz) {
      throw new NotFoundException('Quiz not found');
    }

    let termId = quiz.module?.termId;

    // Fallback: if quiz has no module, resolve termId from the quest that references this quiz
    if (!termId) {
      const linkedQuest = await this.prisma.quest.findFirst({
        where: { quizId },
        select: { termId: true },
      });
      termId = linkedQuest?.termId;
    }

    if (!termId) {
      throw new BadRequestException('Quiz is not linked to a term context');
    }

    const classroomMemberships = await this.prisma.classroomStudent.findMany({
      where: {
        studentId: user.id,
        classroom: {
          termId,
        },
      },
      select: {
        classroomId: true,
      },
    });

    const classroomIds = classroomMemberships.map((item) => item.classroomId);
    if (!classroomIds.length) {
      throw new ForbiddenException('Quiz is not assigned to your classroom');
    }

    const studentProfile = await this.prisma.studentProfile.findUnique({
      where: {
        userId_termId: {
          userId: user.id,
          termId,
        },
      },
      select: { id: true },
    });

    if (!studentProfile) {
      throw new ForbiddenException(
        'Student profile for this term is not found',
      );
    }

    const assignedQuest = await this.prisma.quest.findFirst({
      where: {
        quizId,
        termId,
        status: 'PUBLISHED',
        classrooms: {
          some: {
            classroomId: { in: classroomIds },
          },
        },
      },
      select: {
        id: true,
        title: true,
        rewardCoins: true,
        submissions: {
          where: { studentProfileId: studentProfile.id },
          select: { status: true },
        },
      },
    });

    if (!assignedQuest) {
      throw new ForbiddenException('Quiz is not assigned to your classroom');
    }

    const isClaimed = assignedQuest.submissions?.[0]?.status === 'APPROVED';

    const attempts = await this.prisma.quizAttempt.findMany({
      where: {
        quizId,
        studentProfileId: studentProfile.id,
      },
      orderBy: { attemptNo: 'desc' },
      select: {
        id: true,
        attemptNo: true,
        score: true,
        isPassed: true,
        submittedAt: true,
      },
    });

    // Fetch the latest submitted attempt answers for pre-filling
    let latestAttemptAnswers: Array<{
      questionId: string;
      selectedChoiceIds: string[];
      answerText: string | null;
      answerNumber: number | null;
      attachmentUrl: string | null;
      isCorrect: boolean | null;
    }> = [];

    if (attempts.length > 0) {
      const latestAttempt = attempts[0];
      if (latestAttempt.submittedAt) {
        const answers = await this.prisma.quizAttemptAnswer.findMany({
          where: { attemptId: latestAttempt.id },
          select: {
            questionId: true,
            answerText: true,
            answerNumber: true,
            attachmentUrl: true,
            isCorrect: true,
          },
        });

        const answerChoices =
          await this.prisma.quizAttemptAnswerChoice.findMany({
            where: { attemptId: latestAttempt.id },
            select: {
              questionId: true,
              choiceId: true,
            },
          });

        const choiceMap = new Map<string, string[]>();
        for (const ac of answerChoices) {
          const existing = choiceMap.get(ac.questionId) ?? [];
          existing.push(ac.choiceId);
          choiceMap.set(ac.questionId, existing);
        }

        latestAttemptAnswers = answers.map((answer) => ({
          questionId: answer.questionId,
          selectedChoiceIds: choiceMap.get(answer.questionId) ?? [],
          answerText: answer.answerText,
          answerNumber: answer.answerNumber
            ? Number(answer.answerNumber)
            : null,
          attachmentUrl: answer.attachmentUrl,
          isCorrect: answer.isCorrect,
        }));
      }
    }

    return {
      success: true,
      data: {
        id: quiz.id,
        module: quiz.module,
        timeLimitSec: quiz.timeLimitSec,
        passAllRequired: quiz.passAllRequired,
        quest: {
          ...assignedQuest,
          isClaimed,
        },
        attempts,
        latestAttemptAnswers,
        questions: quiz.questions.map((question) => ({
          id: question.id,
          questionText: question.questionText,
          questionType: question.questionType,
          orderNo: question.orderNo,
          points: question.points,
          choices: question.choices.map((choice) => ({
            id: choice.id,
            choiceText: choice.choiceText,
            orderNo: choice.orderNo,
          })),
        })),
      },
    };
  }

  async deleteQuiz(quizId: string, user: CurrentUser) {
    this.assertTeacherOrAdmin(user);

    const quiz = await this.prisma.quiz.findUnique({
      where: { id: quizId },
      select: {
        id: true,
        _count: { select: { attempts: true } },
      },
    });

    if (!quiz) {
      throw new NotFoundException('Quiz not found');
    }

    if (quiz._count.attempts > 0) {
      throw new BadRequestException('Quiz with attempts cannot be deleted');
    }

    await this.prisma.quiz.delete({ where: { id: quizId } });
    return { success: true, data: { id: quizId } };
  }

  async createAttempt(quizId: string, user: CurrentUser) {
    this.assertStudent(user);

    const quiz = await this.prisma.quiz.findUnique({
      where: { id: quizId },
      include: {
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

    let termId = quiz.module?.termId;

    // Fallback: if quiz has no module, resolve termId from the quest that references this quiz
    if (!termId) {
      const linkedQuest = await this.prisma.quest.findFirst({
        where: { quizId },
        select: { termId: true },
      });
      termId = linkedQuest?.termId;
    }

    if (!termId) {
      throw new BadRequestException('Quiz is not linked to a term context');
    }

    const studentProfile = await this.prisma.studentProfile.findUnique({
      where: {
        userId_termId: {
          userId: user.id,
          termId,
        },
      },
      select: { id: true },
    });

    if (!studentProfile) {
      throw new ForbiddenException(
        'Student profile for this term is not found',
      );
    }

    const maxAttempt = await this.prisma.quizAttempt.aggregate({
      where: {
        quizId,
        studentProfileId: studentProfile.id,
      },
      _max: { attemptNo: true },
    });

    const attempt = await this.prisma.quizAttempt.create({
      data: {
        quizId,
        studentProfileId: studentProfile.id,
        attemptNo: (maxAttempt._max.attemptNo ?? 0) + 1,
      },
    });

    return { success: true, data: attempt };
  }

  private normalizeText(value: string, ignoreCase: boolean, trim: boolean) {
    let normalized = value;
    if (trim) {
      normalized = normalized.trim();
    }
    if (ignoreCase) {
      normalized = normalized.toLowerCase();
    }
    return normalized;
  }

  private gradeAnswer(
    question: QuizQuestionWithChoices,
    answer: SubmitAttemptDto['answers'][number] | undefined,
  ) {
    if (question.gradingType !== QuizGradingType.AUTO) {
      return {
        isCorrect: null as boolean | null,
        awardedPoints: null as number | null,
      };
    }

    if (!answer) {
      return { isCorrect: false, awardedPoints: 0 };
    }

    switch (question.questionType) {
      case QuizQuestionType.SINGLE_CHOICE:
      case QuizQuestionType.TRUEFALSE: {
        const selected = answer.selectedChoiceIds ?? [];
        const picked = question.choices.find((choice) =>
          selected.includes(choice.id),
        );
        const isCorrect = !!picked?.isCorrect && selected.length === 1;
        return { isCorrect, awardedPoints: isCorrect ? question.points : 0 };
      }
      case QuizQuestionType.MULTIPLE_CHOICE: {
        const selected = new Set(answer.selectedChoiceIds ?? []);
        const correctSet = new Set(
          question.choices
            .filter((choice) => choice.isCorrect)
            .map((choice) => choice.id),
        );

        const exactMatch =
          selected.size === correctSet.size &&
          [...selected].every((choiceId) => correctSet.has(choiceId));
        return {
          isCorrect: exactMatch,
          awardedPoints: exactMatch ? question.points : 0,
        };
      }
      case QuizQuestionType.SHORT_TEXT: {
        const key =
          (question.answerKey as Record<string, unknown> | null) ?? {};
        const acceptedAnswers = Array.isArray(key.acceptedAnswers)
          ? (key.acceptedAnswers as string[])
          : [];
        const ignoreCase = key.ignoreCase !== false;
        const trim = key.trim !== false;

        const input = answer.answerText ?? '';
        const normalizedInput = this.normalizeText(input, ignoreCase, trim);
        const normalizedAccepted = acceptedAnswers.map((item) =>
          this.normalizeText(String(item), ignoreCase, trim),
        );
        const isCorrect = normalizedAccepted.includes(normalizedInput);
        return { isCorrect, awardedPoints: isCorrect ? question.points : 0 };
      }
      case QuizQuestionType.NUMERIC: {
        const key =
          (question.answerKey as Record<string, unknown> | null) ?? {};
        const correctValue = Number(key.correctValue ?? Number.NaN);
        const tolerance = Number(key.tolerance ?? 0);
        const answerNumber = Number(answer.answerNumber);
        if (Number.isNaN(correctValue) || Number.isNaN(answerNumber)) {
          return { isCorrect: false, awardedPoints: 0 };
        }
        const isCorrect = Math.abs(answerNumber - correctValue) <= tolerance;
        return { isCorrect, awardedPoints: isCorrect ? question.points : 0 };
      }
      case QuizQuestionType.LONG_TEXT:
      case QuizQuestionType.FILE_UPLOAD:
      default:
        return { isCorrect: null, awardedPoints: null };
    }
  }

  private validateAnswerByType(
    question: QuizQuestionWithChoices,
    answer: SubmitAttemptDto['answers'][number],
  ) {
    switch (question.questionType) {
      case QuizQuestionType.SINGLE_CHOICE:
      case QuizQuestionType.TRUEFALSE: {
        const selected = answer.selectedChoiceIds;
        if (!selected || selected.length !== 1) {
          throw new BadRequestException(
            `${question.questionType} question requires exactly one selectedChoiceId`,
          );
        }
        break;
      }
      case QuizQuestionType.MULTIPLE_CHOICE: {
        const selected = answer.selectedChoiceIds;
        if (!selected || selected.length === 0) {
          throw new BadRequestException(
            'MULTIPLE_CHOICE question requires selectedChoiceIds',
          );
        }
        break;
      }
      case QuizQuestionType.SHORT_TEXT:
      case QuizQuestionType.LONG_TEXT:
        if (!answer.answerText || !answer.answerText.trim()) {
          throw new BadRequestException(
            `${question.questionType} question requires answerText`,
          );
        }
        break;
      case QuizQuestionType.NUMERIC:
        if (
          answer.answerNumber === undefined ||
          Number.isNaN(answer.answerNumber)
        ) {
          throw new BadRequestException(
            'NUMERIC question requires answerNumber',
          );
        }
        break;
      case QuizQuestionType.FILE_UPLOAD:
        if (!answer.attachmentUrl) {
          throw new BadRequestException(
            'FILE_UPLOAD question requires attachmentUrl',
          );
        }
        break;
      default:
        throw new BadRequestException('Unsupported question type');
    }

    if (answer.selectedChoiceIds?.length) {
      const choiceIds = new Set(question.choices.map((choice) => choice.id));
      const invalid = answer.selectedChoiceIds.filter(
        (choiceId) => !choiceIds.has(choiceId),
      );
      if (invalid.length) {
        throw new BadRequestException(
          'Some selectedChoiceIds do not belong to the question',
        );
      }
    }
  }

  async submitAttempt(
    attemptId: string,
    user: CurrentUser,
    dto: SubmitAttemptDto,
  ) {
    this.assertStudent(user);

    const attempt = await this.prisma.quizAttempt.findUnique({
      where: { id: attemptId },
      include: {
        studentProfile: {
          select: {
            id: true,
            userId: true,
          },
        },
        quiz: {
          include: {
            questions: {
              include: {
                choices: true,
              },
            },
          },
        },
      },
    });

    if (!attempt) {
      throw new NotFoundException('Attempt not found');
    }

    if (attempt.studentProfile.userId !== user.id) {
      throw new ForbiddenException('Attempt does not belong to this student');
    }

    if (attempt.submittedAt) {
      throw new BadRequestException('Attempt already submitted');
    }

    const questionMap = new Map(
      attempt.quiz.questions.map((question) => [question.id, question]),
    );
    const seenQuestionIds = new Set<string>();
    const gradingResults = new Map<
      string,
      { isCorrect: boolean | null; awardedPoints: number | null }
    >();

    for (const answer of dto.answers) {
      if (seenQuestionIds.has(answer.questionId)) {
        throw new BadRequestException('Duplicate questionId in submit payload');
      }
      seenQuestionIds.add(answer.questionId);

      const question = questionMap.get(answer.questionId);
      if (!question) {
        throw new BadRequestException(
          'questionId does not belong to this quiz',
        );
      }

      this.validateAnswerByType(question, answer);
      gradingResults.set(question.id, this.gradeAnswer(question, answer));
    }

    for (const question of attempt.quiz.questions) {
      if (!gradingResults.has(question.id)) {
        gradingResults.set(question.id, this.gradeAnswer(question, undefined));
      }
    }

    const totalAutoPoints = attempt.quiz.questions
      .filter((question) => question.gradingType === QuizGradingType.AUTO)
      .reduce((acc, question) => acc + question.points, 0);

    let score = 0;
    for (const result of gradingResults.values()) {
      if (typeof result.awardedPoints === 'number') {
        score += result.awardedPoints;
      }
    }

    // passAllRequired=true => must get all AUTO gradable points.
    // otherwise fallback is score >= 60% of total AUTO gradable points.
    const passThreshold =
      totalAutoPoints > 0 ? Math.ceil(totalAutoPoints * 0.6) : 0;
    const isPassed = attempt.quiz.passAllRequired
      ? score === totalAutoPoints
      : score >= passThreshold;

    const submittedAt = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.quizAttemptAnswerChoice.deleteMany({
        where: { attemptId },
      });
      await tx.quizAttemptAnswer.deleteMany({
        where: { attemptId },
      });

      for (const answer of dto.answers) {
        const graded = gradingResults.get(answer.questionId);

        await tx.quizAttemptAnswer.create({
          data: {
            attemptId,
            questionId: answer.questionId,
            answerText: answer.answerText,
            answerNumber:
              answer.answerNumber !== undefined
                ? new Prisma.Decimal(answer.answerNumber)
                : null,
            attachmentUrl: answer.attachmentUrl,
            isCorrect: graded?.isCorrect ?? null,
            awardedPoints: graded?.awardedPoints ?? null,
          },
        });

        if (answer.selectedChoiceIds?.length) {
          await tx.quizAttemptAnswerChoice.createMany({
            data: answer.selectedChoiceIds.map((choiceId) => ({
              attemptId,
              questionId: answer.questionId,
              choiceId,
            })),
          });
        }
      }

      await tx.quizAttempt.update({
        where: { id: attemptId },
        data: {
          submittedAt,
          score,
          isPassed,
        },
      });

      // Find quest linked to this quiz
      const linkedQuest = await tx.quest.findFirst({
        where: { quizId: attempt.quizId },
        select: {
          id: true,
          type: true,
          rewardCoins: true,
          title: true,
          deadlineAt: true,
        },
      });

      if (linkedQuest) {
        // Teacher-created quiz quests can use SHORT_TEXT or FILE_UPLOAD with
        // MANUAL grading, so key this off gradingType rather than questionType.
        const hasManualQuestions = attempt.quiz.questions.some(
          (q) => q.gradingType === QuizGradingType.MANUAL,
        );

        // Create/update QuestSubmission when manual grading is needed or quiz not passed
        if (hasManualQuestions || !isPassed) {
          const profileId = attempt.studentProfile.id;

          await tx.questSubmission.upsert({
            where: {
              questId_studentProfileId: {
                questId: linkedQuest.id,
                studentProfileId: profileId,
              },
            },
            create: {
              questId: linkedQuest.id,
              studentProfileId: profileId,
              status: QuestSubmissionStatus.PENDING,
              latestVersionNo: 1,
            },
            update: {
              status: QuestSubmissionStatus.PENDING,
              rejectReason: null,
            },
          });
        }
      }
    });

    return {
      success: true,
      data: {
        attemptId,
        score,
        isPassed,
        submittedAt,
        perQuestion: [...gradingResults.entries()].map(
          ([questionId, result]) => ({
            questionId,
            isCorrect: result.isCorrect,
            awardedPoints: result.awardedPoints,
          }),
        ),
      },
    };
  }
}
