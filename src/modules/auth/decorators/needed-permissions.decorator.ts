import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { PermissionValue } from 'src/common/constants/permissions.constant';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { PermissionsGuard } from '../guards/permissions.guard';

export function NeededPermissions(permissions: PermissionValue[]) {
  return applyDecorators(
    SetMetadata('permissions', permissions),
    UseGuards(JwtAuthGuard),
    UseGuards(PermissionsGuard),
  );
}
