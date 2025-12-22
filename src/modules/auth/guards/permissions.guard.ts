import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionValue } from 'src/common/constants/permissions.constant';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService, // ใช้ Prisma โดยตรงเพื่อความเร็วในการดึง Relation
  ) {}

  canActivate(context: ExecutionContext): boolean {
    // 1. ดึง Required Permissions จาก Decorator
    const requiredPermissions = this.reflector.getAllAndOverride<
      PermissionValue[]
    >(
      'permissions', // Key ที่ตรงกับ Decorator
      [context.getHandler(), context.getClass()],
    );

    // ถ้าไม่มีการระบุ Permission แปลว่า Route นี้เปิด Public หรือแค่ Login ก็เข้าได้
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    // 2. ดึง User จาก Request (สมมติว่าผ่าน JwtAuthGuard มาแล้ว)
    const request = context.switchToHttp().getRequest();
    // ตรวจสอบว่ามี User ID หรือไม่
    const userId = request.user?.id; // ปรับตาม payload ของ JWT คุณ
    if (!userId) {
      throw new UnauthorizedException('User not found in request');
    }

    // 3. Query Database: ดึง User -> Role -> Permissions
    // ใช้ findUnique ครั้งเดียว ได้ครบทุกอย่าง (Efficient Query)
    const userWithPermissions = request.user;
    if (!userWithPermissions) {
      throw new UnauthorizedException('User not found in request');
    }

    // 4. Validate User Status
    if (!userWithPermissions) {
      throw new UnauthorizedException('User not found in database');
    }

    if (!userWithPermissions.isActive) {
      throw new ForbiddenException('User account is inactive'); // ERROR_CODE.USER_NOT_ACTIVE
    }

    if (!userWithPermissions.role) {
      throw new ForbiddenException('User has no role assigned'); // ERROR_CODE.USER_HAS_NO_ROLES
    }

    // 5. Flatten Permissions (แปลงจาก Object ซ้อนๆ เป็น Array ของ string)
    const userPermissions: string[] =
      userWithPermissions.role.rolePermissions.map((rp) => rp.permission.name);

    // (Optional) ฝัง Permissions กลับเข้าไปใน Request เผื่อ Controller อยากใช้
    request._permissions = userPermissions;

    // 6. ตรวจสอบว่า User มี Permission ครบตามที่กำหนดหรือไม่ (Logic: AND)
    // ถ้าต้องการแบบ OR (มีแค่อย่างใดอย่างหนึ่งก็ได้) ให้ใช้ .some() แทน .every()
    const hasPermission = requiredPermissions.every((requiredPerm) =>
      userPermissions.includes(requiredPerm),
    );

    if (!hasPermission) {
      throw new ForbiddenException(
        'You do not have permission to access this resource',
      );
    }

    return true;
  }
}
