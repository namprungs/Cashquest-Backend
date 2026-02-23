import { Module } from '@nestjs/common';
import { LearningModuleController } from './learning-module.controller';
import { LearningModuleService } from './learning-module.service';

@Module({
  controllers: [LearningModuleController],
  providers: [LearningModuleService],
})
export class LearningModuleModule {}
