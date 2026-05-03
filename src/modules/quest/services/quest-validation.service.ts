import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, QuestType } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateQuestDto } from '../dto/create-quest.dto';

@Injectable()
export class QuestValidationService {
  constructor(private readonly prisma: PrismaService) {}

  async validateClassroomsInTerm(classroomIds: string[], termId: string): Promise<void> {
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

  async validateQuestQuizConsistency(
    dto: Pick<CreateQuestDto, 'type' | 'quizId' | 'termId'>,
  ): Promise<void> {
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
        throw new BadRequestException('Quiz not found');
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

  async syncClassroomAssignments(
    tx: Prisma.TransactionClient,
    questId: string,
    classroomIds: string[],
  ): Promise<void> {
    await tx.questClassroom.deleteMany({ where: { questId } });
    if (classroomIds.length) {
      await tx.questClassroom.createMany({
        data: classroomIds.map((classroomId) => ({ questId, classroomId })),
        skipDuplicates: true,
      });
    }
  }
}
