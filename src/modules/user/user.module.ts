import { Module } from '@nestjs/common';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { MeProfileController } from './me-profile.controller';
import { AppCacheModule } from '../cache/app-cache.module';

@Module({
  imports: [AppCacheModule],
  controllers: [UserController, MeProfileController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
