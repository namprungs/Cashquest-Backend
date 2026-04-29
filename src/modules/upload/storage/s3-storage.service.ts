import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { createUploadKey } from './file-key.util';
import { StorageService, StoredFile, UploadFile } from './storage.types';

@Injectable()
export class S3StorageService implements StorageService {
  private readonly client: S3Client;

  constructor(private readonly config: ConfigService) {
    this.client = new S3Client({
      region: this.config.getOrThrow<string>('AWS_REGION'),
      credentials: {
        accessKeyId: this.config.getOrThrow<string>('AWS_ACCESS_KEY_ID'),
        secretAccessKey: this.config.getOrThrow<string>(
          'AWS_SECRET_ACCESS_KEY',
        ),
      },
    });
  }

  async upload(file: UploadFile): Promise<StoredFile> {
    const bucket = this.config.getOrThrow<string>('AWS_S3_BUCKET');
    const key = createUploadKey(file.originalname);

    await this.client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      }),
    );

    return {
      key,
      url: this.getPublicUrl(bucket, key),
    };
  }

  private getPublicUrl(bucket: string, key: string) {
    const configured = this.config.get<string>('AWS_S3_PUBLIC_BASE_URL');
    if (configured) {
      return `${configured.replace(/\/+$/, '')}/${key}`;
    }

    const region = this.config.getOrThrow<string>('AWS_REGION');
    return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
  }
}
