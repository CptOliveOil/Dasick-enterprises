import 'server-only';
import type { DataStore } from '@/lib/db/tables';
import type { RunContext } from '@/lib/agents/context';
import type { YoutubeScript, YoutubeVideo } from '@/types/domain';
import type { ProductionSettings, ProductionStage } from '@/types/production';
import { defaultProductionSettings, newVideo } from './defaults';

/**
 * Shared production resolvers.
 *
 * These live below the capability layer so both the original capabilities
 * and the production ones can find the script, video and settings a step is
 * operating on without importing each other.
 */

/** Resolves the script this production is built on. */
export async function resolveScript(ctx: RunContext): Promise<YoutubeScript | null> {
  const direct = ctx.task.input.script_id;
  if (typeof direct === 'string') return ctx.store.get('youtube_scripts', direct);

  for (const key of ['script', 'fact_check']) {
    const id = ctx.previousOutputs[key]?.script_id;
    if (typeof id === 'string') return ctx.store.get('youtube_scripts', id);
  }
  if (ctx.mission) {
    const scripts = await ctx.store.list('youtube_scripts', {
      where: { business_id: ctx.mission.business_id ?? undefined },
      orderBy: { column: 'updated_at', ascending: false },
    });
    const fromMission = scripts.find((s) => s.task_id && s.status === 'approved');
    if (fromMission) return fromMission;
  }
  return null;
}

/**
 * Finds the video record for this mission, creating it on first use.
 *
 * Production always operates on a video row, because that is what carries the
 * pipeline stage, the assets and the cost.
 */
export async function resolveVideo(ctx: RunContext): Promise<YoutubeVideo | null> {
  const direct = ctx.task.input.video_id;
  if (typeof direct === 'string') {
    const found = await ctx.store.get('youtube_videos', direct);
    if (found) return found;
  }

  const businessId = ctx.business?.id ?? ctx.task.business_id;
  if (!businessId) return null;

  const videos = await ctx.store.list('youtube_videos', { where: { business_id: businessId } });
  if (ctx.task.mission_id) {
    const byMission = videos.find((v) => v.mission_id === ctx.task.mission_id);
    if (byMission) return byMission;
  }

  const script = await resolveScript(ctx);
  if (!script) return null;

  const byScript = videos.find((v) => v.script_id === script.id);
  if (byScript) return byScript;

  const channels = await ctx.store.list('youtube_channels', {
    where: { business_id: businessId },
  });
  const next = videos.reduce((max, v) => Math.max(max, v.number), 0) + 1;

  const video = newVideo({
    business_id: businessId,
    channel_id: channels[0]?.id ?? null,
    script_id: script.id,
    idea_id: script.idea_id || null,
    mission_id: ctx.task.mission_id,
    number: next,
    title: script.title,
    status: 'production',
    stage: 'script_approval',
  });
  await ctx.store.insert('youtube_videos', video);
  return video;
}

/** Per-channel production defaults, created on first use. */
export async function resolveSettings(
  store: DataStore,
  ownerId: string,
  businessId: string,
): Promise<ProductionSettings> {
  const existing = await store.list('production_settings', {
    where: { owner_id: ownerId, business_id: businessId },
  });
  if (existing[0]) return existing[0];

  const channels = await store.list('youtube_channels', { where: { business_id: businessId } });
  const settings = defaultProductionSettings(ownerId, businessId, channels[0]?.id ?? null);
  await store.insert('production_settings', settings);
  return settings;
}

export async function setStage(
  store: DataStore,
  videoId: string,
  stage: ProductionStage,
  patch: Partial<YoutubeVideo> = {},
): Promise<void> {
  await store.update('youtube_videos', videoId, {
    stage,
    updated_at: new Date().toISOString(),
    ...patch,
  });
}

