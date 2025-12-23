import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class PlayerService {
  constructor(private prisma: PrismaService) {}

  async assignUserToTerm(userId: string, termId: string) {
    const existingProfile = await this.prisma.studentProfile.findUnique({
      where: {
        userId_termId: { userId, termId },
      },
    });

    if (existingProfile) {
      throw new BadRequestException('User already assigned to this term');
    }

    return this.prisma.studentProfile.create({
      data: {
        userId,
        termId,

        wallet: {
          create: {
            balance: 0,
          },
        },
      },

      // เลือกให้ Return wallet ออกมาด้วยเลย จะได้เช็คได้
      include: {
        wallet: true,
      },
    });
  }
}
