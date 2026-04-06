import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Patch,
  Param,
} from '@nestjs/common';
import { UserService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { CurrentUser } from 'src/modules/auth/decorators/current-user.decorator';
import type { User } from '@prisma/client';
import { NeededPermissions } from 'src/modules/auth/decorators/needed-permissions.decorator';
import { PERMISSIONS } from 'src/common/constants/permissions.constant';
import { RegisterUserDto } from './dto/register-user.dto';
import { AssignSchoolDto } from './dto/assign-school.dto';

@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post()
  create(@Body() createUserDto: CreateUserDto) {
    return this.userService.create(createUserDto);
  }

  // Register a user with specific role (admin-only)
  @Post('register')
  @NeededPermissions([PERMISSIONS.USER.ASSIGN_ROLE])
  registerWithRole(@Body() dto: RegisterUserDto) {
    return this.userService.registerWithRole(dto);
  }

  // Assign or change user's school (admin/staff)
  @Patch(':id/school')
  @NeededPermissions([PERMISSIONS.USER.EDIT])
  assignSchool(@Param('id') id: string, @Body() dto: AssignSchoolDto) {
    return this.userService.assignSchool(id, dto.schoolId);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  getUsers(@CurrentUser() user: User) {
    return this.userService.getMe(user.id);
  }
}
