import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { STORAGE_SERVICE } from './storage/storage.types';
import type { StorageService, UploadFile } from './storage/storage.types';

@Injectable()
export class UploadService {
  private readonly allowedMimeTypes = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf',
  ]);

  constructor(
    private readonly config: ConfigService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {}

  async upload(file?: UploadFile) {
    if (!file?.buffer) {
      throw new BadRequestException('File is required');
    }

    const maxBytes = Number(this.config.get('MAX_UPLOAD_BYTES') ?? 5_242_880);
    if (file.size > maxBytes) {
      throw new BadRequestException('File size exceeds the allowed limit');
    }

    if (!this.allowedMimeTypes.has(file.mimetype)) {
      throw new BadRequestException('Unsupported file type');
    }

    const stored = await this.storage.upload(file);
    return { url: stored.url };
  }
}
