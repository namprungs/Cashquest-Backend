import { Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Prisma, User } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { RegisterUserDto } from './dto/register-user.dto';

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createUserDto: CreateUserDto) {
    const salt = await bcrypt.genSalt();
    createUserDto.password = await bcrypt.hash(createUserDto.password, salt);

    const userExists = await this.prisma.user.findUnique({
      where: { email: createUserDto.email },
    });

    if (userExists) {
      throw new NotFoundException('User already exists');
    }

    const newUser: User = await this.prisma.user.create({
      data: createUserDto,
    });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _password, ...result } = newUser;
    return { data: result, message: 'User created successfully' };
  }

  async registerWithRole(dto: RegisterUserDto) {
    const salt = await bcrypt.genSalt();
    const hashed = await bcrypt.hash(dto.password, salt);

    const userExists = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (userExists) {
      throw new NotFoundException('User already exists');
    }

    const role = await this.prisma.role.findUnique({
      where: { id: dto.roleId },
    });
    if (!role) {
      throw new NotFoundException('Role not found');
    }

    if (dto.schoolId) {
      const school = await this.prisma.school.findUnique({
        where: { id: dto.schoolId },
      });
      if (!school) {
        throw new NotFoundException('School not found');
      }
    }
    console.log('schoolId', dto?.schoolId);
    const newUser = await this.prisma.user.create({
      data: {
        email: dto.email,
        username: dto.username,
        password: hashed,
        roleId: dto.roleId,
        schoolId: dto.schoolId,
      },
      select: {
        id: true,
        email: true,
        username: true,
        roleId: true,
        schoolId: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return { data: newUser, message: 'User registered with role successfully' };
  }

  async assignSchool(userId: string, schoolId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const school = await this.prisma.school.findUnique({
      where: { id: schoolId },
    });
    if (!school) {
      throw new NotFoundException('School not found');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { schoolId },
      select: {
        id: true,
        email: true,
        username: true,
        roleId: true,
        schoolId: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return { data: updated, message: 'User school assigned successfully' };
  }

  async getUser(params: Partial<User>): Promise<User> {
    const user = await this.prisma.user.findFirst({
      where: params,
    });
    if (!user) {
      throw new NotFoundException();
    }

    return user;
  }
  async getUserById(where: Prisma.UserWhereUniqueInput): Promise<User> {
    const user = await this.prisma.user.findUnique({
      where,
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async getUserWithRolePermissionById(id: string) {
    // ลบ : Promise<User> ออก หรือเปลี่ยนเป็น Promise<any> ชั่วคราว ถ้า Type มันฟ้องเรื่อง Relation
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        username: true,
        // 👇 เพิ่ม 3 ตัวนี้เข้าไปครับ
        roleId: true,
        isActive: true,
        schoolId: true,

        // role query เหมือนเดิม
        role: {
          select: {
            name: true,
            rolePermissions: {
              select: {
                permission: { select: { name: true } },
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException();
    }

    return user;
  }

  async getUsers(): Promise<Omit<User, 'password'>> {
    const users = await this.prisma.user.findMany();

    if (!users) {
      throw new NotFoundException();
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    return users.map(({ password, ...user }) => user)[0];
  }

  async getMeProfile(userId: string, termId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        email: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const studentProfile = await this.prisma.studentProfile.findUnique({
      where: {
        userId_termId: {
          userId,
          termId,
        },
      },
      select: {
        id: true,
        termId: true,
      },
    });

    return {
      success: true,
      data: {
        userId: user.id,
        displayName: user.username,
        studentCode: user.username,
        email: user.email,
        studentProfileId: studentProfile?.id ?? null,
        termId,
      },
    };
  }

  async updateUser(query: Partial<User>, data: Partial<User>) {
    return await this.prisma.user.updateMany({
      where: query,
      data: data,
    });
  }

  findAll() {
    return `This action returns all user`;
  }
}
