export type UploadFile = {
  buffer?: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
};

export type StoredFile = {
  key: string;
  url: string;
};

export interface StorageService {
  upload(file: UploadFile): Promise<StoredFile>;
}

export const STORAGE_SERVICE = Symbol('STORAGE_SERVICE');
