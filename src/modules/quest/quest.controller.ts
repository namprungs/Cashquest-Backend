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
  @NeededPermissions([PERMISSIONS.QUEST.CREATE])
  create(@CurrentUser() user: User, @Body() dto: CreateQuestDto) {
    return this.questService.createQuest(user, dto);
  }

  @Post('quiz-draft')
  @NeededPermissions([PERMISSIONS.QUEST.CREATE])
  createQuizDraft(
    @CurrentUser() user: User,
    @Body() dto: TeacherQuizQuestDraftDto,
  ) {
    return this.questService.createTeacherQuizDraft(user, dto);
  }

  @Put(':questId')
  @NeededPermissions([PERMISSIONS.QUEST.EDIT])
  update(
    @Param('questId') questId: string,
    @CurrentUser() user: User,
    @Body() dto: UpdateQuestDto,
  ) {
    return this.questService.updateQuest(questId, user, dto);
  }

  @Put(':questId/quiz-draft')
  @NeededPermissions([PERMISSIONS.QUEST.EDIT])
  updateQuizDraft(
    @Param('questId') questId: string,
    @CurrentUser() user: User,
    @Body() dto: TeacherQuizQuestDraftDto,
  ) {
    return this.questService.updateTeacherQuizDraft(questId, user, dto);
  }

  @Get()
  @NeededPermissions([PERMISSIONS.QUEST.VIEW])
  list(@Query() query: ListQuestsQueryDto) {
    return this.questService.listQuests(query);
  }

  @Get('me')
  @NeededPermissions([PERMISSIONS.QUEST.VIEW_OWN])
  listMe(@CurrentUser() user: User, @Query() query: ListMyQuestsQueryDto) {
    return this.questService.listMyQuests(user, query);
  }

  @Get(':questId/me')
  @NeededPermissions([PERMISSIONS.QUEST.VIEW_OWN])
  getMyQuest(@Param('questId') questId: string, @CurrentUser() user: User) {
    return this.questService.getMyQuestDetail(questId, user);
  }

  @Get(':questId/interactive-status')
  @NeededPermissions([PERMISSIONS.QUEST.VIEW_OWN])
  getInteractiveStatus(
    @Param('questId') questId: string,
    @CurrentUser() user: User,
  ) {
    return this.questService.getInteractiveQuestStatus(questId, user);
  }

  @Get(':questId/submissions/me/status')
  @NeededPermissions([PERMISSIONS.QUEST.VIEW_OWN])
  getMySubmissionStatus(
    @Param('questId') questId: string,
    @CurrentUser() user: User,
  ) {
    return this.questService.getMyQuestSubmissionStatus(questId, user);
  }

  @Get('classrooms/:classroomId/pending-submissions')
  @NeededPermissions([PERMISSIONS.QUEST.SUBMISSION_VIEW])
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
  @NeededPermissions([PERMISSIONS.QUEST.SUBMISSION_VIEW])
  listQuestSubmissions(
    @Param('questId') questId: string,
    @CurrentUser() user: User,
    @Query('classroomId') classroomId?: string,
  ) {
    return this.questService.listQuestSubmissions(questId, user, classroomId);
  }

  @Get(':questId')
  @NeededPermissions([PERMISSIONS.QUEST.VIEW])
  getOne(@Param('questId') questId: string, @CurrentUser() user: User) {
    return this.questService.getQuestById(questId, user);
  }

  @Post(':questId/publish')
  @NeededPermissions([PERMISSIONS.QUEST.PUBLISH])
  publish(@Param('questId') questId: string, @CurrentUser() user: User) {
    return this.questService.publishQuest(questId, user);
  }

  @Post(':questId/close')
  @NeededPermissions([PERMISSIONS.QUEST.CLOSE])
  close(@Param('questId') questId: string, @CurrentUser() user: User) {
    return this.questService.closeQuest(questId, user);
  }

  @Delete(':questId')
  @NeededPermissions([PERMISSIONS.QUEST.DELETE])
  remove(@Param('questId') questId: string, @CurrentUser() user: User) {
    return this.questService.deleteQuest(questId, user);
  }

  @Post(':questId/submissions/me')
  @NeededPermissions([PERMISSIONS.QUEST.SUBMIT])
  submitMe(
    @Param('questId') questId: string,
    @CurrentUser() user: User,
    @Body() dto: SubmitQuestDto,
  ) {
    return this.questService.submitMyQuest(questId, user, dto);
  }

  @Get('submissions/:submissionId')
  @NeededPermissions([PERMISSIONS.QUEST.SUBMISSION_VIEW])
  getSubmissionDetail(@Param('submissionId') submissionId: string) {
    return this.questService.getSubmissionDetail(submissionId);
  }

  @Post('submissions/:submissionId/approve')
  @NeededPermissions([PERMISSIONS.QUEST.SUBMISSION_REVIEW])
  approve(
    @Param('submissionId') submissionId: string,
    @CurrentUser() user: User,
    @Body() dto: ApproveSubmissionDto,
  ) {
    return this.questService.approveSubmission(submissionId, user, dto);
  }

  @Post('submissions/:submissionId/reject')
  @NeededPermissions([PERMISSIONS.QUEST.SUBMISSION_REVIEW])
  reject(
    @Param('submissionId') submissionId: string,
    @CurrentUser() user: User,
    @Body() dto: RejectSubmissionDto,
  ) {
    return this.questService.rejectSubmission(submissionId, user, dto);
  }
  @Post(':questId/claim')
  @NeededPermissions([PERMISSIONS.QUEST.CLAIM_REWARD])
  claim(@Param('questId') questId: string, @CurrentUser() user: User) {
    return this.questService.claimQuestReward(questId, user);
  }
}
