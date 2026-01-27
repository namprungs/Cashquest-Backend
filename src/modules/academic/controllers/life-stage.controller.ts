import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { PERMISSIONS } from 'src/common/constants/permissions.constant';
import { NeededPermissions } from 'src/modules/auth/decorators/needed-permissions.decorator';
import { CreateLifeStageDto } from '../dto/life-stage/create-life-stage.dto';
import { UpdateLifeStageDto } from '../dto/life-stage/update-life-stage.dto';
import { LifeStageService } from '../services/life-stage.service';

@Controller('academic/life-stages')
export class LifeStageController {
  constructor(private readonly lifeStageService: LifeStageService) {}

  @Post()
  @NeededPermissions([PERMISSIONS.ACADEMIC.LIFESTAGE_CREATE])
  create(@Body() dto: CreateLifeStageDto) {
    return this.lifeStageService.create(dto);
  }

  @Get()
  @NeededPermissions([PERMISSIONS.ACADEMIC.LIFESTAGE_VIEW])
  findAll() {
    return this.lifeStageService.findAll();
  }

  @Get(':id')
  @NeededPermissions([PERMISSIONS.ACADEMIC.LIFESTAGE_VIEW])
  findOne(@Param('id') id: string) {
    return this.lifeStageService.findOne(id);
  }

  @Patch(':id')
  @NeededPermissions([PERMISSIONS.ACADEMIC.LIFESTAGE_EDIT])
  update(@Param('id') id: string, @Body() dto: UpdateLifeStageDto) {
    return this.lifeStageService.update(id, dto);
  }

  @Delete(':id')
  @NeededPermissions([PERMISSIONS.ACADEMIC.LIFESTAGE_DELETE])
  remove(@Param('id') id: string) {
    return this.lifeStageService.remove(id);
  }
}
