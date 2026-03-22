import { Module } from '@nestjs/common';
import { RetirementGoalController } from './controllers/retirementGoal.controller';
import { PlayerService } from './services/studentProfile.service';
import { PlayerController } from './controllers/studentProfile.controller';
import { RetirementGoalService } from './services/retirementGoal.service';
import { FinanceModule } from '../finance/finance.module';

@Module({
  imports: [FinanceModule],
  controllers: [PlayerController, RetirementGoalController],
  providers: [PlayerService, RetirementGoalService],
  exports: [PlayerService],
})
export class PlayerModule {}
