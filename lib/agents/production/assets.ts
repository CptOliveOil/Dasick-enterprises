import 'server-only';
import path from 'node:path';
import { visualPlanResponseSchema } from '@/schemas/production';
import { createMediaAsset, recordFailedAsset } from '@/lib/media/assets';
import { readOutput, renderPlaceholderImage, withTempDir } from '@/lib/media/ffmpeg';
import {
  getImageProvider,
  getStockProvider,
  getVideoProvider,
} from '@/lib/integrations/providers/registry';
import type { ProducedMedia } from '@/lib/integrations/providers/types';
import { getJobQueue } from '@/lib/jobs/queue';
import { checkSpend } from '@/lib/finance/budgets';
import { islamicContext } from '@/lib/islamic/resolve';
import { violatedVisualRules } from '@/lib/islamic/policy';
import type { CapabilityHandler, PersistResult } from '@/lib/agents/capabilities';
import type { YoutubeScene } from '@/types/domain';
import type { AssetStrategy } from '@/types/production';
import {
  blockProduction,
  requestSpendApproval,
  resolveSettings,
  resolveVideo,
  setStage,
  spendAuthorised,
} from './context';

/** Strategies the renderer satisfies locally, with no external provider. */
const LOCAL_STRATEGIES: AssetStrategy[] = ['text_motion'];

function providerFor(strategy: AssetStrategy) {
  switch (strategy) {
    case 'generated_image':
      return { kind: 'image' as const, provider: getImageProvider() };
    case 'generated_video':
      return { kind: 'video' as const, provider: getVideoProvider() };
    case 'stock':
    case 'archive_public_source':
      return { kind: 'stock' as const, provider: getStockProvider() };
    default:
      return null;
  }
}

/**
 * Obtains the visual for every scene that still needs one.
 *
 * Runs with bounded concurrency so a thirty-scene video does not fire thirty
 * paid generations at once, checks the budget before spending anything, and
 * blocks with the exact missing provider rather than substituting placeholder
 * media outside Demo Mode.
 */
export const assetGenerate: CapabilityHandler = {
  capability: 'youtube.asset_generate',
  label: 'Generate scene assets',
  mode: 'provider',
  schemaName: 'AssetGeneration',
  schema: visualPlanResponseSchema as never,

  async run(ctx): Promise<PersistResult> {
    const video = await resolveVideo(ctx);
    if (!video) return blockProduction(ctx, null, 'No video record exists to generate assets for.');

    const businessId = ctx.business?.id ?? ctx.task.business_id ?? '';
    const settings = await resolveSettings(ctx.store, ctx.ownerId, businessId);
    const budget = (await checkSpend(ctx.store, ctx.ownerId, businessId, video.id, 'other', 0)).budget;

    const allScenes = (await ctx.store.list('youtube_scenes', { where: { video_id: video.id } }))
      .slice()
      .sort((a, b) => a.scene_number - b.scene_number);

    if (allScenes.length === 0) {
      return blockProduction(ctx, video, 'No scene plan exists yet, so there is nothing to source.');
    }

    // Only scenes that still need something. Retries pick up failures too.
    const pending = allScenes.filter(
      (scene) => !scene.asset_id || scene.status === 'failed' || scene.status === 'blocked',
    );
    if (pending.length === 0) {
      await setStage(ctx.store, video.id, 'thumbnail', { blocked_reason: null });
      return {
        summary: `found every scene already has an asset (${allScenes.length} scenes)`,
        output: { video_id: video.id, generated: 0, total: allScenes.length },
      };
    }

    // --- Channel visual rules, before anything is spent -------------------
    // The Visual Director was given these as constraints and checked against
    // them, but a scene can also be edited by hand after planning. Checking
    // again here means no money is spent generating something the channel has
    // said it will not use.
    const { rules } = await islamicContext(ctx.store, ctx.ownerId, businessId);
    if (rules) {
      const violations = pending.flatMap((scene) => violatedVisualRules(scene, rules));
      if (violations.length > 0) {
        return blockProduction(
          ctx,
          video,
          `Some scenes break this channel's visual rules, so nothing was generated. ${violations.slice(0, 3).join(' ')}`,
        );
      }
    }

    // --- Provider availability, before anything is attempted --------------
    const neededStrategies = [...new Set(pending.map((s) => s.asset_strategy))];
    const missing: string[] = [];
    for (const strategy of neededStrategies) {
      if (LOCAL_STRATEGIES.includes(strategy)) continue;
      const resolved = providerFor(strategy);
      if (!resolved) continue;
      if (!resolved.provider.isConnected()) {
        missing.push(
          `${strategy.replace('_', ' ')} needs a ${resolved.kind} provider (${resolved.provider.descriptor.requiredEnv.join(', ')})`,
        );
      }
    }
    if (missing.length > 0) {
      return blockProduction(
        ctx,
        video,
        `Cannot source every scene. ${missing.join('; ')}. Connect the provider, or change those scenes to a strategy you can satisfy.`,
        { notifyKind: 'provider_required' },
      );
    }

    // --- Cost, before anything is spent ----------------------------------
    const estimate = estimateSceneCost(pending);
    if (estimate > 0 && !spendAuthorised(ctx)) {
      const imageEstimate = estimateSceneCost(
        pending.filter((s) => s.asset_strategy === 'generated_image'),
      );
      const videoEstimate = estimateSceneCost(
        pending.filter((s) => s.asset_strategy === 'generated_video'),
      );
      for (const [category, amount] of [
        ['image', imageEstimate],
        ['video', videoEstimate],
      ] as const) {
        if (amount <= 0) continue;
        const check = await checkSpend(ctx.store, ctx.ownerId, businessId, video.id, category, amount);
        if (check.exceedsCeiling) {
          return blockProduction(ctx, video, check.reason, { notifyKind: 'budget_exceeded' });
        }
      }
      const overall = await checkSpend(ctx.store, ctx.ownerId, businessId, video.id, 'other', estimate);
      if (overall.requiresApproval) {
        return requestSpendApproval(ctx, video, {
          estimate,
          category: `${pending.length} scene assets`,
          reason:
            `Sourcing ${pending.length} scenes is estimated at £${estimate.toFixed(2)} ` +
            `(${pending.filter((s) => s.asset_strategy === 'generated_video').length} generated clips, ` +
            `${pending.filter((s) => s.asset_strategy === 'generated_image').length} generated stills). ` +
            overall.reason,
          resumeInput: { video_id: video.id },
        });
      }
    }

    // --- Generate, with bounded concurrency -------------------------------
    const concurrency = Math.max(1, Math.min(budget.concurrency, 6));
    const queue = getJobQueue(ctx.store);
    let completed = 0;
    let spent = 0;
    let simulatedCount = 0;
    const failures: { scene: number; reason: string }[] = [];

    const workers = Array.from({ length: Math.min(concurrency, pending.length) }, async () => {
      for (;;) {
        const scene = pending.shift();
        if (!scene) return;
        try {
          const produced = await sourceScene(ctx, scene, settings.width, settings.height, queue, video.id);
          const asset = await createMediaAsset(ctx.store, {
            ownerId: ctx.ownerId,
            businessId,
            missionId: ctx.task.mission_id,
            videoId: video.id,
            sceneId: scene.id,
            taskId: ctx.task.id,
            type: scene.asset_strategy === 'generated_video' ? 'video_clip' : 'image',
            provider: produced.provider,
            providerAssetId: produced.media.providerAssetId ?? null,
            mimeType: produced.media.mimeType,
            extension: produced.media.extension,
            data: produced.media.data,
            duration: produced.media.durationSeconds ?? null,
            width: produced.media.width ?? settings.width,
            height: produced.media.height ?? settings.height,
            generationPrompt: produced.prompt,
            generationCost: produced.media.cost,
            simulated: produced.media.simulated,
            metadata: produced.media.metadata,
          });

          await ctx.store.update('youtube_scenes', scene.id, {
            asset_id: asset.id,
            asset_status: 'ready',
            status: 'ready',
            error: null,
          });
          completed += 1;
          spent += produced.media.cost;
          if (produced.media.simulated) simulatedCount += 1;
        } catch (error) {
          const reason = error instanceof Error ? error.message : 'Unknown generation failure';
          await recordFailedAsset(ctx.store, {
            ownerId: ctx.ownerId,
            businessId,
            missionId: ctx.task.mission_id,
            videoId: video.id,
            sceneId: scene.id,
            taskId: ctx.task.id,
            type: scene.asset_strategy === 'generated_video' ? 'video_clip' : 'image',
            provider: scene.asset_strategy,
            mimeType: 'application/octet-stream',
            error: reason,
          });
          await ctx.store.update('youtube_scenes', scene.id, {
            asset_status: 'failed',
            status: 'failed',
            error: reason,
          });
          failures.push({ scene: scene.scene_number, reason });
        }
      }
    });
    await Promise.all(workers);

    await ctx.store.update('youtube_videos', video.id, {
      actual_cost: Number((video.actual_cost + spent).toFixed(4)),
      updated_at: new Date().toISOString(),
    });

    if (failures.length > 0) {
      const detail = failures
        .slice(0, 3)
        .map((f) => `scene ${f.scene}: ${f.reason}`)
        .join('; ');
      return blockProduction(
        ctx,
        video,
        `${failures.length} of ${completed + failures.length} scenes could not be sourced (${detail}). Fix or retry them in the scene editor.`,
      );
    }

    await setStage(ctx.store, video.id, 'thumbnail', { blocked_reason: null, status: 'production' });

    return {
      summary: `sourced ${completed} scene ${completed === 1 ? 'asset' : 'assets'}${
        simulatedCount > 0 ? ` (${simulatedCount} simulated)` : ''
      }`,
      output: {
        video_id: video.id,
        generated: completed,
        simulated: simulatedCount,
        total: allScenes.length,
        cost: Number(spent.toFixed(4)),
      },
      spend: spent > 0 ? { amount: spent, provider: 'media', product: 'scene assets' } : undefined,
    };
  },
};

interface SourcedScene {
  media: ProducedMedia;
  provider: string;
  prompt: string;
}

async function sourceScene(
  ctx: Parameters<NonNullable<CapabilityHandler['run']>>[0],
  scene: YoutubeScene,
  width: number,
  height: number,
  queue: ReturnType<typeof getJobQueue>,
  videoId: string,
): Promise<SourcedScene> {
  const businessId = ctx.business?.id ?? ctx.task.business_id ?? '';

  // Text-motion scenes are drawn locally. This is the real deliverable for
  // that strategy, not a stand-in, so it is never marked simulated.
  if (LOCAL_STRATEGIES.includes(scene.asset_strategy)) {
    const media = await withTempDir(async (dir) => {
      const output = path.join(dir, 'card.png');
      await renderPlaceholderImage({
        width,
        height,
        background: '#0b1020',
        lines: [
          { text: scene.on_screen_text || scene.visual_direction, size: Math.round(height * 0.06) },
        ],
        outputPath: output,
      });
      return {
        data: await readOutput(output),
        mimeType: 'image/png',
        extension: 'png',
        width,
        height,
        cost: 0,
        simulated: false,
      } satisfies ProducedMedia;
    });
    return { media, provider: 'local-text', prompt: scene.on_screen_text };
  }

  const resolved = providerFor(scene.asset_strategy);
  if (!resolved) throw new Error(`No provider handles the "${scene.asset_strategy}" strategy.`);

  // The queue records and observes the work; the provider call itself happens
  // inside the handler, and its result is captured by closure because media
  // buffers are not serialisable job output.
  let produced: SourcedScene | null = null;

  await queue.run(
    {
      ownerId: ctx.ownerId,
      businessId,
      missionId: ctx.task.mission_id,
      videoId,
      sceneId: scene.id,
      taskId: ctx.task.id,
      kind: scene.asset_strategy === 'generated_video' ? 'video_clip' : 'image',
      provider: resolved.provider.descriptor.name,
      input: { scene_number: scene.scene_number, strategy: scene.asset_strategy },
      estimatedCost: estimateSceneCost([scene]),
    },
    async ({ progress }) => {
      await progress(30);
      produced = await sourceSceneDirect(scene, width, height, resolved);
      await progress(100);
      return {
        output: {
          prompt: produced.prompt,
          simulated: produced.media.simulated,
          bytes: produced.media.data.byteLength,
        },
        actualCost: produced.media.cost,
      };
    },
  );

  if (!produced) throw new Error('The provider returned nothing for this scene.');
  return produced;
}

async function sourceSceneDirect(
  scene: YoutubeScene,
  width: number,
  height: number,
  resolved: NonNullable<ReturnType<typeof providerFor>>,
): Promise<SourcedScene> {
  if (resolved.kind === 'image') {
    const prompt = scene.image_prompt || scene.visual_direction;
    return {
      media: await getImageProvider().generateImage({ prompt, width, height, purpose: 'scene' }),
      provider: resolved.provider.descriptor.name,
      prompt,
    };
  }
  if (resolved.kind === 'video') {
    const prompt = scene.video_prompt || scene.visual_direction;
    return {
      media: await getVideoProvider().generateVideo({
        prompt,
        durationSeconds: scene.duration_seconds,
        width,
        height,
      }),
      provider: resolved.provider.descriptor.name,
      prompt,
    };
  }
  const stock = getStockProvider();
  const prompt = scene.b_roll_query || scene.visual_direction;
  const results = await stock.search(prompt, scene.visual_type === 'video' ? 'video' : 'image');
  if (results.length === 0) throw new Error(`No stock result for "${prompt}".`);
  return {
    media: await stock.fetchAsset(results[0]!),
    provider: resolved.provider.descriptor.name,
    prompt,
  };
}

/** Estimate using each provider's own pricing, so a disconnected one costs nothing. */
export function estimateSceneCost(scenes: YoutubeScene[]): number {
  const image = getImageProvider();
  const video = getVideoProvider();
  let total = 0;
  for (const scene of scenes) {
    if (scene.asset_strategy === 'generated_image') total += image.estimateCost(1);
    else if (scene.asset_strategy === 'generated_video')
      total += video.estimateCost(scene.duration_seconds);
  }
  return Number(total.toFixed(4));
}
