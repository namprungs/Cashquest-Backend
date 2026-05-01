import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { createUploadKey } from './file-key.util';
import { StorageService, StoredFile, UploadFile } from './storage.types';

@Injectable()
export class S3StorageService implements StorageService {
  private readonly client: S3Client;

  constructor(private readonly config: ConfigService) {
    console.log('initial s3');
    const endpoint = this.config.get<string>('S3_ENDPOINT');

    this.client = new S3Client({
      region: this.config.get<string>('S3_REGION', 'us-east-1'),

      ...(endpoint
        ? {
            endpoint,
            forcePathStyle: this.config.get<boolean>(
              'S3_FORCE_PATH_STYLE',
              false,
            ),
          }
        : {}),

      credentials: {
        accessKeyId: this.config.getOrThrow<string>('S3_ACCESS_KEY_ID'),
        secretAccessKey: this.config.getOrThrow<string>('S3_SECRET_ACCESS_KEY'),
      },
    });
  }

  async upload(file: UploadFile): Promise<StoredFile> {
    const bucket = this.config.getOrThrow<string>('S3_BUCKET');
    const key = createUploadKey(file.originalname);

    await this.client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,

        // ใช้เมื่อ bucket/space ตั้งให้ไฟล์ public ได้
        // ถ้า bucket เป็น private ให้ลบบรรทัดนี้ออก แล้วใช้ signed URL แทน
        ACL: this.config.get<'private' | 'public-read'>(
          'S3_ACL',
          'public-read',
        ),
      }),
    );

    return {
      key,
      url: this.getPublicUrl(key),
    };
  }

  private getPublicUrl(key: string): string {
    const baseUrl = this.config.getOrThrow<string>('S3_PUBLIC_BASE_URL');

    return `${baseUrl.replace(/\/+$/, '')}/${key}`;
  }
}
