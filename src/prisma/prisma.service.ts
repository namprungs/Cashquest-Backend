import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor() {
    // 1. สร้าง Connection Pool ของ Database
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });

    // 2. สร้าง Adapter
    const adapter = new PrismaPg(pool);

    // 3. ส่ง adapter เข้าไปใน super() ตามกฎใหม่ของ Prisma 7
    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
  }
}
