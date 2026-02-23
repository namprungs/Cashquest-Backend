import { PartialType } from '@nestjs/mapped-types';
import { CreateLearningModuleDto } from './create-learning-module.dto';

export class UpdateLearningModuleDto extends PartialType(
  CreateLearningModuleDto,
) {}
