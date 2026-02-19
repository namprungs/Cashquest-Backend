import { Module } from '@nestjs/common';
import { PlayerService } from './services/studentProfile.service';
import { PlayerController } from './controllers/studentProfile.controller';
import { FinanceModule } from '../finance/finance.module';

@Module({
  imports: [FinanceModule],
  controllers: [PlayerController],
  providers: [PlayerService],
  exports: [PlayerService],
})
export class PlayerModule {}
