import { extname } from 'path';

export function sanitizeFilename(filename: string) {
  const extension = extname(filename).toLowerCase();
  const base = filename
    .slice(0, filename.length - extension.length)
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);

  return `${base || 'file'}${extension}`;
}

export function createUploadKey(filename: string) {
  return `uploads/${Date.now()}-${sanitizeFilename(filename)}`;
}
