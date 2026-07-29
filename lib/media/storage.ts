import 'server-only';
import { mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { config, supabaseConfigured } from '@/lib/config';
import { createSupabaseServiceClient } from '@/lib/supabase/server';

export interface StoredFile {
  /** Path within the driver. Combine with the driver to read it back. */
  storagePath: string;
  /**
   * A genuinely reachable URL, or null. Never a plausible-looking placeholder —
   * a null here is what stops the UI claiming an asset is downloadable.
   */
  publicUrl: string | null;
  fileSize: number;
}

/**
 * Where generated media actually lives.
 *
 * Two drivers: Supabase Storage when configured, and the local filesystem
 * otherwise. The renderer needs real files on disk either way, so the local
 * driver is also the staging area when Supabase is in use.
 */
export interface MediaStorage {
  readonly driver: 'supabase' | 'local';
  write(key: string, data: Buffer, contentType: string): Promise<StoredFile>;
  /** Absolute local path, downloading from remote storage first if needed. */
  localPath(storagePath: string): Promise<string>;
  read(storagePath: string): Promise<Buffer>;
  remove(storagePath: string): Promise<void>;
}

/** Files live under `.data/media`, outside the build output and gitignored. */
export const MEDIA_ROOT = path.join(process.cwd(), '.data', 'media');
const BUCKET = 'command-centre-media';

async function ensureDir(filePath: string) {
  await mkdir(path.dirname(filePath), { recursive: true });
}

class LocalMediaStorage implements MediaStorage {
  readonly driver = 'local' as const;

  async write(key: string, data: Buffer, _contentType: string): Promise<StoredFile> {
    const full = path.join(MEDIA_ROOT, key);
    await ensureDir(full);
    await writeFile(full, data);
    return {
      storagePath: key,
      // Served through an authenticated route rather than a public URL, so the
      // link only works for someone who can already see the workspace.
      publicUrl: null,
      fileSize: data.byteLength,
    };
  }

  async localPath(storagePath: string): Promise<string> {
    return path.join(MEDIA_ROOT, storagePath);
  }

  async read(storagePath: string): Promise<Buffer> {
    return readFile(path.join(MEDIA_ROOT, storagePath));
  }

  async remove(storagePath: string): Promise<void> {
    await unlink(path.join(MEDIA_ROOT, storagePath)).catch(() => undefined);
  }
}

class SupabaseMediaStorage implements MediaStorage {
  readonly driver = 'supabase' as const;
  private local = new LocalMediaStorage();

  constructor(private client: NonNullable<ReturnType<typeof createSupabaseServiceClient>>) {}

  async write(key: string, data: Buffer, contentType: string): Promise<StoredFile> {
    // Keep a local copy so ffmpeg can work without a round trip.
    await this.local.write(key, data, contentType);

    const { error } = await this.client.storage
      .from(BUCKET)
      .upload(key, data, { contentType, upsert: true });
    if (error) throw new Error(`Storage upload failed: ${error.message}`);

    const { data: signed } = await this.client.storage
      .from(BUCKET)
      .createSignedUrl(key, 60 * 60 * 24 * 7);

    return {
      storagePath: key,
      publicUrl: signed?.signedUrl ?? null,
      fileSize: data.byteLength,
    };
  }

  async localPath(storagePath: string): Promise<string> {
    const full = path.join(MEDIA_ROOT, storagePath);
    const exists = await stat(full).then(
      () => true,
      () => false,
    );
    if (!exists) {
      const buffer = await this.read(storagePath);
      await ensureDir(full);
      await writeFile(full, buffer);
    }
    return full;
  }

  async read(storagePath: string): Promise<Buffer> {
    const { data, error } = await this.client.storage.from(BUCKET).download(storagePath);
    if (error || !data) throw new Error(`Storage download failed: ${error?.message}`);
    return Buffer.from(await data.arrayBuffer());
  }

  async remove(storagePath: string): Promise<void> {
    await this.client.storage.from(BUCKET).remove([storagePath]);
    await this.local.remove(storagePath);
  }
}

let cached: MediaStorage | null = null;

export function getMediaStorage(): MediaStorage {
  if (cached) return cached;
  if (supabaseConfigured && config.supabase.serviceKey) {
    const client = createSupabaseServiceClient();
    if (client) {
      cached = new SupabaseMediaStorage(client);
      return cached;
    }
  }
  cached = new LocalMediaStorage();
  return cached;
}

/** Deterministic, collision-free key for an asset. */
export function assetKey(
  businessId: string | null,
  type: string,
  assetId: string,
  extension: string,
): string {
  return `${businessId ?? 'global'}/${type}/${assetId}.${extension.replace(/^\./, '')}`;
}
