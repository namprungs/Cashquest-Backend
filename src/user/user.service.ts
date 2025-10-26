import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { Prisma, User } from '@prisma/client';

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createUserDto: CreateUserDto) {
    const salt = await bcrypt.genSalt();
    createUserDto.password = await bcrypt.hash(createUserDto.password, salt);
    const newUser = await this.prisma.user.create({
      data: createUserDto,
    });

    return { data: newUser, message: 'User created successfully' };
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

  async getUsers(): Promise<User> {
    const user = await this.prisma.user.findMany();

    if (!user) {
      throw new NotFoundException();
    }
    return user[0];
  }

  async updateUser(query: Partial<User>, data: Partial<User>) {
    return this.prisma.user.updateMany({
      where: query,
      data: data,
    });
  }

  findAll() {
    return `This action returns all user`;
  }
}
