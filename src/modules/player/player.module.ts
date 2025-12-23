import { Module } from '@nestjs/common';
import { PlayerService } from './services/studentProfile.service';
import { PlayerController } from './controllers/studentProfile.controller';

@Module({
  controllers: [PlayerController],
  providers: [PlayerService],
})
export class PlayerModule {}
