import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import type { User } from '@prisma/client';
import { PERMISSIONS } from 'src/common/constants/permissions.constant';
import { CurrentUser } from 'src/modules/auth/decorators/current-user.decorator';
import { NeededPermissions } from 'src/modules/auth/decorators/needed-permissions.decorator';
import { CreateRetirementGoalDto } from '../dto/create-retirement-goal.dto';
import { UpdateRetirementGoalDto } from '../dto/update-retirement-goal.dto';
import { RetirementGoalService } from '../services/retirementGoal.service';

@Controller('player/terms/:termId/retirement-goals')
export class RetirementGoalController {
  constructor(private readonly retirementGoalService: RetirementGoalService) {}

  @Post()
  @NeededPermissions([PERMISSIONS.PLAYER.RETIREMENT_GOAL_MANAGE])
  create(
    @Param('termId', new ParseUUIDPipe()) termId: string,
    @CurrentUser() user: User,
    @Body() dto: CreateRetirementGoalDto,
  ) {
    return this.retirementGoalService.create(termId, user.id, dto);
  }

  @Get()
  @NeededPermissions([PERMISSIONS.PLAYER.RETIREMENT_GOAL_MANAGE])
  findAll(
    @Param('termId', new ParseUUIDPipe()) termId: string,
    @CurrentUser() user: User,
  ) {
    return this.retirementGoalService.findAll(termId, user.id);
  }

  @Get(':id')
  @NeededPermissions([PERMISSIONS.PLAYER.RETIREMENT_GOAL_MANAGE])
  findOne(
    @Param('termId', new ParseUUIDPipe()) termId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: User,
  ) {
    return this.retirementGoalService.findOne(termId, user.id, id);
  }

  @Patch(':id')
  @NeededPermissions([PERMISSIONS.PLAYER.RETIREMENT_GOAL_MANAGE])
  update(
    @Param('termId', new ParseUUIDPipe()) termId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: User,
    @Body() dto: UpdateRetirementGoalDto,
  ) {
    return this.retirementGoalService.update(termId, user.id, id, dto);
  }

  @Delete(':id')
  @NeededPermissions([PERMISSIONS.PLAYER.RETIREMENT_GOAL_MANAGE])
  remove(
    @Param('termId', new ParseUUIDPipe()) termId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: User,
  ) {
    return this.retirementGoalService.remove(termId, user.id, id);
  }
}
