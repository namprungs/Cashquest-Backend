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
import { QuestService } from './quest.service';
import { NeededPermissions } from '../auth/decorators/needed-permissions.decorator';
import { PERMISSIONS } from 'src/common/constants/permissions.constant';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { User } from '@prisma/client';
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

@Controller('quests')
export class QuestController {
  constructor(private readonly questService: QuestService) {}

  @Post()
  @NeededPermissions([PERMISSIONS.SIMULATION.CONTENT_MANAGE])
  create(@CurrentUser() user: User, @Body() dto: CreateQuestDto) {
    return this.questService.createQuest(user, dto);
  }

  @Post('quiz-draft')
  @NeededPermissions([PERMISSIONS.SIMULATION.CONTENT_MANAGE])
  createQuizDraft(
    @CurrentUser() user: User,
    @Body() dto: TeacherQuizQuestDraftDto,
  ) {
    return this.questService.createTeacherQuizDraft(user, dto);
  }

  @Put(':questId')
  @NeededPermissions([PERMISSIONS.SIMULATION.CONTENT_MANAGE])
  update(
    @Param('questId') questId: string,
    @CurrentUser() user: User,
    @Body() dto: UpdateQuestDto,
  ) {
    return this.questService.updateQuest(questId, user, dto);
  }

  @Put(':questId/quiz-draft')
  @NeededPermissions([PERMISSIONS.SIMULATION.CONTENT_MANAGE])
  updateQuizDraft(
    @Param('questId') questId: string,
    @CurrentUser() user: User,
    @Body() dto: TeacherQuizQuestDraftDto,
  ) {
    return this.questService.updateTeacherQuizDraft(questId, user, dto);
  }

  @Get()
  @NeededPermissions([PERMISSIONS.SIMULATION.CONTENT_MANAGE])
  list(@Query() query: ListQuestsQueryDto) {
    return this.questService.listQuests(query);
  }

  @Get('me')
  @NeededPermissions([PERMISSIONS.USER.VIEW_SELF])
  listMe(@CurrentUser() user: User, @Query() query: ListMyQuestsQueryDto) {
    return this.questService.listMyQuests(user, query);
  }

  @Get(':questId/me')
  @NeededPermissions([PERMISSIONS.SIMULATION.PLAY])
  getMyQuest(@Param('questId') questId: string, @CurrentUser() user: User) {
    return this.questService.getMyQuestDetail(questId, user);
  }

  @Get(':questId/interactive-status')
  @NeededPermissions([PERMISSIONS.SIMULATION.PLAY])
  getInteractiveStatus(
    @Param('questId') questId: string,
    @CurrentUser() user: User,
  ) {
    return this.questService.getInteractiveQuestStatus(questId, user);
  }

  @Get(':questId/submissions/me/status')
  @NeededPermissions([PERMISSIONS.SIMULATION.PLAY])
  getMySubmissionStatus(
    @Param('questId') questId: string,
    @CurrentUser() user: User,
  ) {
    return this.questService.getMyQuestSubmissionStatus(questId, user);
  }

  @Get('classrooms/:classroomId/pending-submissions')
  @NeededPermissions([PERMISSIONS.SIMULATION.CONTENT_MANAGE])
  getPendingSubmissions(
    @Param('classroomId') classroomId: string,
    @Query('limit') limit?: string,
  ) {
    const limitNum = limit ? parseInt(limit, 10) : 50;
    return this.questService.getPendingSubmissionsForClassroom(
      classroomId,
      limitNum,
    );
  }

  @Get(':questId/submissions')
  @NeededPermissions([PERMISSIONS.SIMULATION.CONTENT_MANAGE])
  listQuestSubmissions(
    @Param('questId') questId: string,
    @CurrentUser() user: User,
    @Query('classroomId') classroomId?: string,
  ) {
    return this.questService.listQuestSubmissions(questId, user, classroomId);
  }

  @Get(':questId')
  @NeededPermissions([PERMISSIONS.SIMULATION.CONTENT_MANAGE])
  getOne(@Param('questId') questId: string, @CurrentUser() user: User) {
    return this.questService.getQuestById(questId, user);
  }

  @Post(':questId/publish')
  @NeededPermissions([PERMISSIONS.SIMULATION.CONTENT_MANAGE])
  publish(@Param('questId') questId: string, @CurrentUser() user: User) {
    return this.questService.publishQuest(questId, user);
  }

  @Post(':questId/close')
  @NeededPermissions([PERMISSIONS.SIMULATION.CONTENT_MANAGE])
  close(@Param('questId') questId: string, @CurrentUser() user: User) {
    return this.questService.closeQuest(questId, user);
  }

  @Delete(':questId')
  @NeededPermissions([PERMISSIONS.SIMULATION.CONTENT_MANAGE])
  remove(@Param('questId') questId: string, @CurrentUser() user: User) {
    return this.questService.deleteQuest(questId, user);
  }

  @Post(':questId/submissions/me')
  @NeededPermissions([PERMISSIONS.SIMULATION.PLAY])
  submitMe(
    @Param('questId') questId: string,
    @CurrentUser() user: User,
    @Body() dto: SubmitQuestDto,
  ) {
    return this.questService.submitMyQuest(questId, user, dto);
  }

  @Get('submissions/:submissionId')
  @NeededPermissions([PERMISSIONS.SIMULATION.CONTENT_MANAGE])
  getSubmissionDetail(@Param('submissionId') submissionId: string) {
    return this.questService.getSubmissionDetail(submissionId);
  }

  @Post('submissions/:submissionId/approve')
  @NeededPermissions([PERMISSIONS.SIMULATION.CONTENT_MANAGE])
  approve(
    @Param('submissionId') submissionId: string,
    @CurrentUser() user: User,
    @Body() dto: ApproveSubmissionDto,
  ) {
    return this.questService.approveSubmission(submissionId, user, dto);
  }

  @Post('submissions/:submissionId/reject')
  @NeededPermissions([PERMISSIONS.SIMULATION.CONTENT_MANAGE])
  reject(
    @Param('submissionId') submissionId: string,
    @CurrentUser() user: User,
    @Body() dto: RejectSubmissionDto,
  ) {
    return this.questService.rejectSubmission(submissionId, user, dto);
  }
  @Post(':questId/claim')
  @NeededPermissions([PERMISSIONS.SIMULATION.PLAY])
  claim(@Param('questId') questId: string, @CurrentUser() user: User) {
    return this.questService.claimQuestReward(questId, user);
  }
}
