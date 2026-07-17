import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { env, supabaseStorageEnabled, supabaseUrl } from '../config/env.js';

const SUPABASE_PREFIX = 'supabase:';
const bucket = env.SUPABASE_CV_BUCKET;

const supabase = supabaseStorageEnabled
  ? createClient(supabaseUrl!, env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

let bucketReady = false;
async function ensureBucket(): Promise<void> {
  if (!supabase || bucketReady) return;
  const { data } = await supabase.storage.getBucket(bucket);
  if (!data) {
    const { error } = await supabase.storage.createBucket(bucket, { public: false });
    // Ignore "already exists" races; surface anything else.
    if (error && !/exist/i.test(error.message)) throw error;
  }
  bucketReady = true;
}

function buildFilename(originalName: string): string {
  const ext = path.extname(originalName) || '';
  const safeBase = path
    .basename(originalName, ext)
    .replace(/[^a-zA-Z0-9-_]+/g, '_')
    .slice(0, 60);
  return `${Date.now()}-${randomUUID().slice(0, 8)}-${safeBase}${ext}`;
}

/**
 * Persist an uploaded CV. Uses Supabase Storage when configured (survives redeploys),
 * otherwise falls back to local disk. The returned `storagePath` is opaque to callers:
 * Supabase objects are prefixed `supabase:`; local files store a relative path.
 */
export async function saveCvFile(
  buffer: Buffer,
  originalName: string,
  contentType?: string,
): Promise<{ storagePath: string; filename: string }> {
  const filename = buildFilename(originalName);

  if (supabase) {
    await ensureBucket();
    const { error } = await supabase.storage.from(bucket).upload(filename, buffer, {
      contentType: contentType || 'application/octet-stream',
      upsert: false,
    });
    if (error) throw error;
    return { storagePath: `${SUPABASE_PREFIX}${filename}`, filename };
  }

  const uploadRoot = path.resolve(process.cwd(), env.UPLOAD_DIR);
  await mkdir(uploadRoot, { recursive: true });
  await writeFile(path.join(uploadRoot, filename), buffer);
  return { storagePath: path.join(env.UPLOAD_DIR, filename), filename };
}

/** Remove a stored CV (Supabase object or local file). Never throws. */
export async function deleteCvFile(storagePath: string | null): Promise<void> {
  if (!storagePath) return;
  try {
    if (storagePath.startsWith(SUPABASE_PREFIX)) {
      if (supabase) await supabase.storage.from(bucket).remove([storagePath.slice(SUPABASE_PREFIX.length)]);
      return;
    }
    const { unlink } = await import('node:fs/promises');
    await unlink(path.resolve(process.cwd(), storagePath)).catch(() => {});
  } catch {
    /* best-effort */
  }
}

export type CvSource =
  | { kind: 'redirect'; url: string }
  | { kind: 'file'; absPath: string };

/**
 * Resolve a stored CV to something the download route can serve — a short-lived signed
 * URL (Supabase) or an absolute file path (local). Returns null if the file is gone.
 */
export async function getCvSource(
  storagePath: string,
  downloadName?: string,
): Promise<CvSource | null> {
  if (storagePath.startsWith(SUPABASE_PREFIX)) {
    if (!supabase) return null;
    const key = storagePath.slice(SUPABASE_PREFIX.length);
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(key, 120, { download: downloadName ?? true });
    if (error || !data) return null;
    return { kind: 'redirect', url: data.signedUrl };
  }

  const absPath = path.resolve(process.cwd(), storagePath);
  if (!existsSync(absPath)) return null;
  return { kind: 'file', absPath };
}
