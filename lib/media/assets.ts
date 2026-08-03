import 'server-only';
import { uuid } from '@/lib/ids';
import type { DataStore } from '@/lib/db/tables';
import { logActivity } from '@/lib/agents/activity';
import type { MediaAsset, MediaAssetType } from '@/types/production';
import { assetKey, getMediaStorage } from './storage';

export interface CreateAssetInput {
  ownerId: string;
  businessId: string | null;
  missionId?: string | null;
  videoId?: string | null;
  sceneId?: string | null;
  taskId?: string | null;
  productId?: string | null;
  type: MediaAssetType;
  provider: string;
  providerAssetId?: string | null;
  mimeType: string;
  extension: string;
  data: Buffer;
  duration?: number | null;
  width?: number | null;
  height?: number | null;
  generationPrompt?: string | null;
  generationCost?: number;
  /** True only for placeholder media produced in Demo Mode. */
  simulated?: boolean;
  metadata?: Record<string, unknown>;
}

/**
 * Writes a file to storage and records it. An asset row only ever reaches
 * `ready` once the bytes are genuinely written, so a `ready` asset always has
 * something behind it.
 */
export async function createMediaAsset(
  store: DataStore,
  input: CreateAssetInput,
): Promise<MediaAsset> {
  const id = uuid();
  const timestamp = new Date().toISOString();
  const storage = getMediaStorage();
  const key = assetKey(input.businessId, input.type, id, input.extension);

  const stored = await storage.write(key, input.data, input.mimeType);

  const asset: MediaAsset = {
    id,
    owner_id: input.ownerId,
    business_id: input.businessId,
    mission_id: input.missionId ?? null,
    video_id: input.videoId ?? null,
    scene_id: input.sceneId ?? null,
    task_id: input.taskId ?? null,
    product_id: input.productId ?? null,
    type: input.type,
    provider: input.provider,
    provider_asset_id: input.providerAssetId ?? null,
    storage_path: stored.storagePath,
    public_url: stored.publicUrl,
    mime_type: input.mimeType,
    duration: input.duration ?? null,
    width: input.width ?? null,
    height: input.height ?? null,
    file_size: stored.fileSize,
    generation_prompt: input.generationPrompt ?? null,
    generation_cost: input.generationCost ?? 0,
    status: 'ready',
    simulated: input.simulated ?? false,
    error: null,
    metadata: input.metadata ?? {},
    created_at: timestamp,
    updated_at: timestamp,
  };

  await store.insert('media_assets', asset);
  await logActivity(store, {
    ownerId: input.ownerId,
    businessId: input.businessId,
    missionId: input.missionId ?? null,
    taskId: input.taskId ?? null,
    kind: 'asset_created',
    message: `${input.simulated ? 'Simulated ' : ''}${input.type.replace('_', ' ')} asset created (${formatBytes(stored.fileSize)})`,
    metadata: { asset_id: id, provider: input.provider, simulated: input.simulated ?? false },
  });

  return asset;
}

/** Records an asset that failed to generate, so the reason is not lost. */
export async function recordFailedAsset(
  store: DataStore,
  input: Omit<CreateAssetInput, 'data' | 'extension'> & { error: string },
): Promise<MediaAsset> {
  const timestamp = new Date().toISOString();
  const asset: MediaAsset = {
    id: uuid(),
    owner_id: input.ownerId,
    business_id: input.businessId,
    mission_id: input.missionId ?? null,
    video_id: input.videoId ?? null,
    scene_id: input.sceneId ?? null,
    task_id: input.taskId ?? null,
    product_id: input.productId ?? null,
    type: input.type,
    provider: input.provider,
    provider_asset_id: null,
    storage_path: null,
    public_url: null,
    mime_type: input.mimeType,
    duration: null,
    width: null,
    height: null,
    file_size: null,
    generation_prompt: input.generationPrompt ?? null,
    generation_cost: 0,
    status: 'failed',
    simulated: input.simulated ?? false,
    error: input.error,
    metadata: input.metadata ?? {},
    created_at: timestamp,
    updated_at: timestamp,
  };
  await store.insert('media_assets', asset);
  return asset;
}

export async function assetLocalPath(asset: MediaAsset): Promise<string> {
  if (!asset.storage_path) {
    throw new Error(`Asset ${asset.id} has no stored file.`);
  }
  return getMediaStorage().localPath(asset.storage_path);
}

/**
 * Where the UI can actually load this asset from, or null if it cannot.
 *
 * `public_url` stays honest about whether a directly-reachable URL exists —
 * the local storage driver never sets one, on purpose, because a link that
 * only works for someone already signed in is not a public URL. But it *is*
 * playable, through the authenticated `/api/media/[id]` route, which is the
 * only way anything renders in Demo Mode or a Supabase-less setup. Screens
 * that decide "is there something to watch" must ask this, not `public_url`
 * directly, or every non-Supabase deployment looks permanently unplayable.
 */
export function playableUrl(
  asset: Pick<MediaAsset, 'id' | 'status' | 'storage_path' | 'public_url'> | null | undefined,
): string | null {
  if (!asset) return null;
  if (asset.public_url) return asset.public_url;
  if (asset.status === 'ready' && asset.storage_path) return `/api/media/${asset.id}`;
  return null;
}

export function formatBytes(bytes: number | null): string {
  if (bytes === null) return 'unknown size';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
