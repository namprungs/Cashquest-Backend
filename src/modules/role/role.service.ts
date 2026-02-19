import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateRoleDto } from './dto/create-role.dto';

@Injectable()
export class RoleService {
  constructor(private readonly prisma: PrismaService) {}

  async listRoles() {
    const roles = await this.prisma.role.findMany({
      include: {
        rolePermissions: {
          include: { permission: { select: { name: true } } },
        },
      },
      orderBy: { name: 'asc' },
    });

    return roles.map((role) => ({
      id: role.id,
      name: role.name,
      permissions: role.rolePermissions.map((rp) => rp.permission.name),
    }));
  }

  async createOrUpdateRole(dto: CreateRoleDto) {
    // Validate permission names exist
    const permissions = await this.prisma.permission.findMany({
      where: { name: { in: dto.permissions } },
    });
    const foundNames = new Set(permissions.map((p) => p.name));
    const missing = dto.permissions.filter((n) => !foundNames.has(n));
    if (missing.length) {
      throw new NotFoundException(
        `Permissions not found: ${missing.join(', ')}`,
      );
    }

    const rolePermissionsData = permissions.map((perm) => ({
      permissionId: perm.id,
    }));

    const role = await this.prisma.role.upsert({
      where: { name: dto.name },
      update: {
        rolePermissions: { deleteMany: {}, create: rolePermissionsData },
      },
      create: {
        name: dto.name,
        rolePermissions: { create: rolePermissionsData },
      },
    });

    return { id: role.id, name: role.name };
  }
}
