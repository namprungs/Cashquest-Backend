import { PartialType } from '@nestjs/mapped-types';
import { CreateLifeStageDto } from './create-life-stage.dto';

export class UpdateLifeStageDto extends PartialType(CreateLifeStageDto) {}
