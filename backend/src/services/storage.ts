import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from '../config/env.js';

const uploadRoot = path.resolve(process.cwd(), env.UPLOAD_DIR);

/**
 * Persists an uploaded CV to local disk and returns a relative storage path.
 * Swap this implementation for Supabase Storage / S3 later without touching callers.
 */
export async function saveCvFile(
  buffer: Buffer,
  originalName: string,
): Promise<{ storagePath: string; filename: string }> {
  await mkdir(uploadRoot, { recursive: true });

  const ext = path.extname(originalName) || '';
  const safeBase = path
    .basename(originalName, ext)
    .replace(/[^a-zA-Z0-9-_]+/g, '_')
    .slice(0, 60);
  const filename = `${Date.now()}-${randomUUID().slice(0, 8)}-${safeBase}${ext}`;
  const absPath = path.join(uploadRoot, filename);

  await writeFile(absPath, buffer);

  return { storagePath: path.join(env.UPLOAD_DIR, filename), filename };
}

export function resolveStoragePath(storagePath: string): string {
  return path.resolve(process.cwd(), storagePath);
}
