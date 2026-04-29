import { Module } from '@nestjs/common';
import { LearningModuleController } from './learning-module.controller';
import { LearningModuleService } from './learning-module.service';
import { AppCacheModule } from '../cache/app-cache.module';

@Module({
  imports: [AppCacheModule],
  controllers: [LearningModuleController],
  providers: [LearningModuleService],
})
export class LearningModuleModule {}
