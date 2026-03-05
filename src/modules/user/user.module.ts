import { Module } from '@nestjs/common';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { MeProfileController } from './me-profile.controller';

@Module({
  controllers: [UserController, MeProfileController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
