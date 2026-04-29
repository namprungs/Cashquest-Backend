import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { createUploadKey } from './file-key.util';
import { StorageService, StoredFile, UploadFile } from './storage.types';

@Injectable()
export class LocalStorageService implements StorageService {
  constructor(private readonly config: ConfigService) {}

  async upload(file: UploadFile): Promise<StoredFile> {
    const key = createUploadKey(file.originalname);
    const uploadRoot = this.getUploadRoot();
    const relativePath = key.replace(/^uploads\//, '');

    await mkdir(uploadRoot, { recursive: true });
    await writeFile(join(uploadRoot, relativePath), file.buffer as Buffer);

    const publicBaseUrl = String(
      this.config.get('PUBLIC_API_BASE_URL') ?? 'http://localhost:3000',
    ).replace(/\/+$/, '');

    return {
      key,
      url: `${publicBaseUrl}/${key}`,
    };
  }

  getUploadRoot() {
    const configured = String(this.config.get('UPLOAD_DIR') ?? 'uploads');
    return configured.startsWith('/')
      ? configured
      : join(process.cwd(), configured);
  }
}
