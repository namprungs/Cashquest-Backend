import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { createPostgresPoolOptions } from './database-config';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly pool: Pool;

  constructor() {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is missing. Please check your .env file.');
    }

    const pool = new Pool(
      createPostgresPoolOptions(databaseUrl, {
        max: parsePositiveInt(process.env.DATABASE_POOL_MAX, 20),
        idleTimeoutMillis: parsePositiveInt(
          process.env.DATABASE_POOL_IDLE_TIMEOUT_MS,
          300000,
        ),
        connectionTimeoutMillis: parsePositiveInt(
          process.env.DATABASE_POOL_CONNECTION_TIMEOUT_MS,
          10000,
        ),
      }),
    );

    const adapter = new PrismaPg(pool);
    super({ adapter });
    this.pool = pool;
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
    await this.pool.end();
  }
}

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
