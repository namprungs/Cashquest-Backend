import { Body, Controller, Get, Post } from '@nestjs/common';
import { RoleService } from './role.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { NeededPermissions } from 'src/modules/auth/decorators/needed-permissions.decorator';
import { PERMISSIONS } from 'src/common/constants/permissions.constant';

@Controller('roles')
export class RoleController {
  constructor(private readonly roleService: RoleService) {}

  @Get()
  @NeededPermissions([PERMISSIONS.USER.ASSIGN_ROLE])
  list() {
    return this.roleService.listRoles();
  }

  @Post()
  @NeededPermissions([PERMISSIONS.USER.ASSIGN_ROLE])
  createOrUpdate(@Body() dto: CreateRoleDto) {
    return this.roleService.createOrUpdateRole(dto);
  }

  @Get('permissions')
  @NeededPermissions([PERMISSIONS.USER.ASSIGN_ROLE])
  listPermissions() {
    // Flatten permissions from constant
    return Object.values(PERMISSIONS).flatMap((group) => Object.values(group));
  }
}
