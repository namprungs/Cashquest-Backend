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
    const newUser: User = await this.prisma.user.create({
      data: createUserDto,
    });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _password, ...result } = newUser;
    return { data: result, message: 'User created successfully' };
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

  async getUsers(): Promise<Omit<User, 'password'>> {
    const users = await this.prisma.user.findMany();

    if (!users) {
      throw new NotFoundException();
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    return users.map(({ password, ...user }) => user)[0];
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
