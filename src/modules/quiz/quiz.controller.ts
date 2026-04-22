import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { QuizService } from './quiz.service';
import { NeededPermissions } from '../auth/decorators/needed-permissions.decorator';
import { PERMISSIONS } from 'src/common/constants/permissions.constant';
import { CreateQuizSnapshotDto } from './dto/create-quiz-snapshot.dto';
import { UpdateQuizSnapshotDto } from './dto/update-quiz-snapshot.dto';
import { ListQuizzesQueryDto } from './dto/list-quizzes-query.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { User } from '@prisma/client';
import { SubmitAttemptDto } from './dto/submit-attempt.dto';

@Controller()
export class QuizController {
  constructor(private readonly quizService: QuizService) {}

  @Post('quizzes')
  @NeededPermissions([PERMISSIONS.SIMULATION.CONTENT_MANAGE])
  createQuiz(@CurrentUser() user: User, @Body() dto: CreateQuizSnapshotDto) {
    return this.quizService.createQuizSnapshot(user, dto);
  }

  @Put('quizzes/:quizId')
  @NeededPermissions([PERMISSIONS.SIMULATION.CONTENT_MANAGE])
  updateQuiz(
    @Param('quizId') quizId: string,
    @CurrentUser() user: User,
    @Body() dto: UpdateQuizSnapshotDto,
  ) {
    return this.quizService.updateQuizSnapshot(quizId, user, dto);
  }

  @Get('quizzes')
  @NeededPermissions([PERMISSIONS.SIMULATION.CONTENT_MANAGE])
  listQuizzes(@Query() query: ListQuizzesQueryDto) {
    return this.quizService.listQuizzes(query);
  }

  @Get('quizzes/:quizId')
  @NeededPermissions([PERMISSIONS.SIMULATION.CONTENT_MANAGE])
  getQuiz(@Param('quizId') quizId: string) {
    return this.quizService.getQuizById(quizId);
  }

  @Get('quizzes/:quizId/me')
  @NeededPermissions([PERMISSIONS.SIMULATION.PLAY])
  getQuizForStudent(
    @Param('quizId') quizId: string,
    @CurrentUser() user: User,
  ) {
    return this.quizService.getQuizForStudent(quizId, user);
  }

  @Delete('quizzes/:quizId')
  @NeededPermissions([PERMISSIONS.SIMULATION.CONTENT_MANAGE])
  deleteQuiz(@Param('quizId') quizId: string, @CurrentUser() user: User) {
    return this.quizService.deleteQuiz(quizId, user);
  }

  @Post('quizzes/:quizId/attempts')
  @NeededPermissions([PERMISSIONS.SIMULATION.PLAY])
  createAttempt(@Param('quizId') quizId: string, @CurrentUser() user: User) {
    return this.quizService.createAttempt(quizId, user);
  }

  @Post('attempts/:attemptId/submit')
  @NeededPermissions([PERMISSIONS.SIMULATION.PLAY])
  submitAttempt(
    @Param('attemptId') attemptId: string,
    @CurrentUser() user: User,
    @Body() dto: SubmitAttemptDto,
  ) {
    return this.quizService.submitAttempt(attemptId, user, dto);
  }
}
