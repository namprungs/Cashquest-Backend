import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { NeededPermissions } from '../auth/decorators/needed-permissions.decorator';
import { PERMISSIONS } from 'src/common/constants/permissions.constant';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { User } from '@prisma/client';
import { CreateLearningModuleDto } from './dto/create-learning-module.dto';
import { UpdateLearningModuleDto } from './dto/update-learning-module.dto';
import { ListLearningModulesQueryDto } from './dto/list-learning-modules-query.dto';
import { LearningModuleService } from './learning-module.service';

@Controller('learning-modules')
export class LearningModuleController {
  constructor(private readonly learningModuleService: LearningModuleService) {}

  @Post()
  @NeededPermissions([PERMISSIONS.SIMULATION.CONTENT_MANAGE])
  create(@CurrentUser() user: User, @Body() dto: CreateLearningModuleDto) {
    return this.learningModuleService.create(user, dto);
  }

  @Put(':moduleId')
  @NeededPermissions([PERMISSIONS.SIMULATION.CONTENT_MANAGE])
  update(
    @Param('moduleId') moduleId: string,
    @CurrentUser() user: User,
    @Body() dto: UpdateLearningModuleDto,
  ) {
    return this.learningModuleService.update(moduleId, user, dto);
  }

  @Delete(':moduleId')
  @NeededPermissions([PERMISSIONS.SIMULATION.CONTENT_MANAGE])
  remove(@Param('moduleId') moduleId: string, @CurrentUser() user: User) {
    return this.learningModuleService.remove(moduleId, user);
  }

  @Patch(':moduleId/activate')
  @NeededPermissions([PERMISSIONS.SIMULATION.CONTENT_MANAGE])
  activate(@Param('moduleId') moduleId: string, @CurrentUser() user: User) {
    return this.learningModuleService.setActive(moduleId, user, true);
  }

  @Patch(':moduleId/deactivate')
  @NeededPermissions([PERMISSIONS.SIMULATION.CONTENT_MANAGE])
  deactivate(@Param('moduleId') moduleId: string, @CurrentUser() user: User) {
    return this.learningModuleService.setActive(moduleId, user, false);
  }

  @Get()
  @NeededPermissions([PERMISSIONS.SIMULATION.CONTENT_MANAGE])
  list(@Query() query: ListLearningModulesQueryDto) {
    return this.learningModuleService.list(query);
  }

  @Get(':moduleId')
  @NeededPermissions([PERMISSIONS.SIMULATION.CONTENT_MANAGE])
  findOne(@Param('moduleId') moduleId: string) {
    return this.learningModuleService.findOne(moduleId);
  }
}
