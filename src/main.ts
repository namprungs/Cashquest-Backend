import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import morgan from 'morgan';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { NestExpressApplication } from '@nestjs/platform-express';
import { mkdir } from 'fs/promises';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );
  app.use(cookieParser());

  app.use(morgan('dev'));
  const uploadDir = process.env.UPLOAD_DIR ?? 'uploads';
  const uploadRoot = uploadDir.startsWith('/')
    ? uploadDir
    : join(process.cwd(), uploadDir);
  await mkdir(uploadRoot, { recursive: true });
  app.useStaticAssets(uploadRoot, { prefix: '/uploads/' });
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
