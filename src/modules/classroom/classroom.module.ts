import { Module } from '@nestjs/common';
import { ClassroomService } from './classroom.service';
import { ClassroomController } from './classroom.controller';
import { PlayerModule } from '../player/player.module';
import { QuestModule } from '../quest/quest.module';

@Module({
  imports: [PlayerModule, QuestModule],
  controllers: [ClassroomController],
  providers: [ClassroomService],
})
export class ClassroomModule {}
