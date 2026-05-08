import 'dotenv/config';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import * as fs from 'node:fs';

const logFile = '/tmp/test-harness.log';

function log(msg: string) {
  fs.appendFileSync(logFile, msg + '\n');
  console.log(msg);
}

process.on('uncaughtException', (err) => {
  log(`uncaughtException: ${err instanceof Error ? err.stack || err.message : String(err)}`);
});

process.on('unhandledRejection', (reason) => {
  log(`unhandledRejection: ${reason instanceof Error ? reason.stack || reason.message : String(reason)}`);
});

function createPrismaClient() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
  });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

const prisma = createPrismaClient();

(async () => {
  try {
    log('✓ Script started');
    log(`Arguments: ${JSON.stringify(process.argv)}`);
    
    // Check for duration argument
    const soakArg = process.argv.find((arg) => arg.startsWith('--duration-ms='));
    const soakDurationMs = soakArg ? Number(soakArg.split('=')[1]) : 10 * 60 * 1000;
    log(`Soak duration: ${soakDurationMs}ms`);

    log('Creating NestJS app...');
      let app;
      try {
        log('About to call NestFactory.create()...');
        app = await NestFactory.create(AppModule, { logger: false });
        log('✓ NestFactory.create() completed');
      } catch (createError) {
        log(`✗ NestFactory.create() failed: ${createError instanceof Error ? createError.message : String(createError)}`);
        if (createError instanceof Error && createError.stack) {
          log(`Stack: ${createError.stack.split('\n').slice(0, 10).join('\n')}`);
        }
        throw createError;
      }
    
      log('Setting up global pipes...');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    app.use(cookieParser());
    await app.init();
    log('✓ NestJS app initialized');

    const server = request(app.getHttpServer());

    log('Checking term...');
    const term = await prisma.term.findFirst({
      select: { id: true },
    });
    log(`✓ Term found: ${term?.id}`);

    log('Testing login...');
    const response = await server
      .post('/auth/login')
      .send({ email: 'admin@school.com', password: 'Admin@1234' });
    
    log(`Login response status: ${response.status}`);
    if (response.status === 200) {
      log(`✓ Login successful`);
    } else {
      log(`✗ Login failed: ${response.body?.message || 'Unknown error'}`);
    }

    log('Test completed successfully');
    await app.close();
    await prisma.$disconnect();
    log('✓ Resources cleaned up');
  } catch (error) {
    log(`✗ Error: ${error instanceof Error ? error.message : String(error)}`);
    log(`Stack: ${error instanceof Error ? error.stack : ''}`);
    process.exitCode = 1;
  } finally {
    try {
      await prisma.$disconnect();
    } catch (e) {
      log(`Failed to disconnect prisma: ${e}`);
    }
  }
})().catch((error) => {
  log(`Unhandled error in IIFE: ${error}`);
  process.exitCode = 1;
});
