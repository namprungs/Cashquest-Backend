import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';
import { LocalStorageService } from './storage/local-storage.service';
import { S3StorageService } from './storage/s3-storage.service';
import { STORAGE_SERVICE } from './storage/storage.types';

@Module({
  controllers: [UploadController],
  providers: [
    UploadService,
    {
      provide: STORAGE_SERVICE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        return config.get('STORAGE_TYPE') === 's3'
          ? new S3StorageService(config)
          : new LocalStorageService(config);
      },
    },
  ],
})
export class UploadModule {}
