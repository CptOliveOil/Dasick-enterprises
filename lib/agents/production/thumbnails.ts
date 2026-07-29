import 'server-only';
import { thumbnailPlanResponseSchema } from '@/schemas/production';
import { createMediaAsset } from '@/lib/media/assets';
import { getImageProvider } from '@/lib/integrations/providers/registry';
import { getJobQueue } from '@/lib/jobs/queue';
import { checkSpend } from '@/lib/finance/budgets';
import type { CapabilityHandler, PersistResult } from '@/lib/agents/capabilities';
import {
  blockProduction,
  requestSpendApproval,
  resolveVideo,
  setStage,
  spendAuthorised,
} from './context';

/** Thumbnails are 16:9 and read at postage-stamp size. */
const THUMB_WIDTH = 1280;
const THUMB_HEIGHT = 720;

/**
 * Renders candidate images for the thumbnail concepts.
 *
 * A provider step. It never selects a winner: choosing the thumbnail is the
 * operator's call, and the video keeps `thumbnail_asset_id` empty until they
 * make it.
 */
export const thumbnailGenerate: CapabilityHandler = {
  capability: 'youtube.thumbnail.generate',
  label: 'Generate thumbnail candidates',
  mode: 'provider',
  schemaName: 'ThumbnailGeneration',
  schema: thumbnailPlanResponseSchema as never,

  async run(ctx): Promise<PersistResult> {
    const video = await resolveVideo(ctx);
    if (!video) return blockProduction(ctx, null, 'No video record exists to make thumbnails for.');

    const businessId = ctx.business?.id ?? ctx.task.business_id ?? '';
    const concepts = (
      await ctx.store.list('youtube_thumbnail_concepts', { where: { video_id: video.id } })
    ).filter((concept) => !concept.asset_id);

    if (concepts.length === 0) {
      const all = await ctx.store.list('youtube_thumbnail_concepts', {
        where: { video_id: video.id },
      });
      if (all.length === 0) {
        return blockProduction(
          ctx,
          video,
          'No thumbnail concepts exist yet, so there is nothing to render.',
        );
      }
      await setStage(ctx.store, video.id, 'metadata', { blocked_reason: null });
      return {
        summary: `found candidate images already exist for all ${all.length} concepts`,
        output: { video_id: video.id, generated: 0 },
      };
    }

    const provider = getImageProvider();
    if (!provider.isConnected()) {
      // Concepts without images are still useful — the operator can upload
      // their own — so this is a warning-shaped block, not a dead end.
      return blockProduction(
        ctx,
        video,
        `No image provider is connected, so thumbnail candidates cannot be rendered. Set ${provider.descriptor.requiredEnv.join(' and ')}, or upload a thumbnail yourself in the production view.`,
        { notifyKind: 'provider_required' },
      );
    }

    const estimate = provider.estimateCost(concepts.length);
    if (estimate > 0 && !spendAuthorised(ctx)) {
      const check = await checkSpend(ctx.store, ctx.ownerId, businessId, video.id, 'image', estimate);
      if (check.exceedsCeiling) {
        return blockProduction(ctx, video, check.reason, { notifyKind: 'budget_exceeded' });
      }
      if (check.requiresApproval) {
        return requestSpendApproval(ctx, video, {
          estimate,
          category: `${concepts.length} thumbnail candidates`,
          reason: `Rendering ${concepts.length} thumbnail candidates is estimated at £${estimate.toFixed(2)}. ${check.reason}`,
          resumeInput: { video_id: video.id },
        });
      }
    }

    const queue = getJobQueue(ctx.store);
    let generated = 0;
    let spent = 0;
    let simulated = 0;
    const failures: string[] = [];

    for (const concept of concepts) {
      try {
        await queue.run(
          {
            ownerId: ctx.ownerId,
            businessId,
            missionId: ctx.task.mission_id,
            videoId: video.id,
            taskId: ctx.task.id,
            kind: 'thumbnail',
            provider: provider.descriptor.name,
            input: { concept: concept.concept_title },
            estimatedCost: provider.estimateCost(1),
          },
          async ({ progress }) => {
            await progress(40);
            const produced = await provider.generateImage({
              prompt: concept.image_prompt,
              width: THUMB_WIDTH,
              height: THUMB_HEIGHT,
              purpose: 'thumbnail',
            });

            const asset = await createMediaAsset(ctx.store, {
              ownerId: ctx.ownerId,
              businessId,
              missionId: ctx.task.mission_id,
              videoId: video.id,
              taskId: ctx.task.id,
              type: 'thumbnail',
              provider: provider.descriptor.name,
              mimeType: produced.mimeType,
              extension: produced.extension,
              data: produced.data,
              width: produced.width ?? THUMB_WIDTH,
              height: produced.height ?? THUMB_HEIGHT,
              generationPrompt: concept.image_prompt,
              generationCost: produced.cost,
              simulated: produced.simulated,
              metadata: { concept_id: concept.id, concept_title: concept.concept_title },
            });

            await ctx.store.update('youtube_thumbnail_concepts', concept.id, {
              asset_id: asset.id,
            });
            generated += 1;
            spent += produced.cost;
            if (produced.simulated) simulated += 1;

            await progress(100);
            return { output: { asset_id: asset.id }, actualCost: produced.cost };
          },
        );
      } catch (error) {
        failures.push(
          `${concept.concept_title}: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      }
    }

    await ctx.store.update('youtube_videos', video.id, {
      actual_cost: Number((video.actual_cost + spent).toFixed(4)),
      updated_at: new Date().toISOString(),
    });

    if (generated === 0) {
      return blockProduction(
        ctx,
        video,
        `No thumbnail candidate could be rendered. ${failures.slice(0, 2).join('; ')}`,
      );
    }

    await setStage(ctx.store, video.id, 'metadata', { blocked_reason: null });

    return {
      summary: `rendered ${generated} thumbnail ${generated === 1 ? 'candidate' : 'candidates'}${
        simulated > 0 ? ` (${simulated} simulated)` : ''
      }${failures.length > 0 ? `, ${failures.length} failed` : ''}`,
      output: {
        video_id: video.id,
        generated,
        simulated,
        failed: failures.length,
      },
      spend:
        spent > 0
          ? { amount: spent, provider: provider.descriptor.name, product: 'thumbnails' }
          : undefined,
    };
  },
};
