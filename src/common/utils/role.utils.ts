import { ForbiddenException } from '@nestjs/common';
import type { CurrentUser } from '../types/current-user.type';

export function getRoleName(user: CurrentUser): string {
  return user?.role?.name?.toUpperCase?.() ?? '';
}

export function assertTeacherOrAdmin(user: CurrentUser): void {
  const roleName = getRoleName(user);
  if (!roleName || !['TEACHER', 'ADMIN', 'SUPER_ADMIN'].includes(roleName)) {
    throw new ForbiddenException(
      'Only teacher/admin can perform this action',
    );
  }
}

export function assertStudent(user: CurrentUser): void {
  const roleName = getRoleName(user);
  if (!roleName || roleName !== 'STUDENT') {
    throw new ForbiddenException('Only student can perform this action');
  }
}
