import { Module } from '@nestjs/common';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { MeProfileController } from './me-profile.controller';
import { AppCacheModule } from '../cache/app-cache.module';
import { UserProfileService } from './services/user-profile.service';
import { LeaderboardService } from './services/leaderboard.service';

@Module({
  imports: [AppCacheModule],
  controllers: [UserController, MeProfileController],
  providers: [UserService, UserProfileService, LeaderboardService],
  exports: [UserService],
})
export class UserModule {}
