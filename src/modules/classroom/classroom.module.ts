import { Module } from '@nestjs/common';
import { ClassroomService } from './classroom.service';
import { ClassroomController } from './classroom.controller';
import { PlayerModule } from '../player/player.module';

@Module({
  imports: [PlayerModule],
  controllers: [ClassroomController],
  providers: [ClassroomService],
})
export class ClassroomModule {}
