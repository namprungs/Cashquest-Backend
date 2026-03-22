import { Module } from '@nestjs/common';
import { AdminBadgeController } from './controllers/admin-badge.controller';
import { BadgeController } from './controllers/badge.controller';
import { BadgeService } from './services/badge.service';

@Module({
  controllers: [BadgeController, AdminBadgeController],
  providers: [BadgeService],
  exports: [BadgeService],
})
export class GamificationModule {}
