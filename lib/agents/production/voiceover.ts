import 'server-only';
import type { z } from 'zod';
import { uuid } from '@/lib/ids';
import { voiceoverPlanResponseSchema } from '@/schemas/production';
import { createMediaAsset } from '@/lib/media/assets';
import { probeMedia } from '@/lib/media/ffmpeg';
import { getMediaStorage } from '@/lib/media/storage';
import { getVoiceProvider } from '@/lib/integrations/providers/registry';
import { isNotConnected } from '@/lib/integrations/providers/types';
import { getJobQueue } from '@/lib/jobs/queue';
import { checkSpend } from '@/lib/finance/budgets';
import type { CapabilityHandler } from '@/lib/agents/capabilities';
import type { YoutubeVoiceover } from '@/types/production';
import {
  blockProduction,
  requestSpendApproval,
  resolveScript,
  resolveSettings,
  resolveVideo,
  setStage,
  spendAuthorised,
} from './context';
import { baseProductionContext } from './prompt';

/* ------------------------------------------------------------------ */
/* Plan                                                                */
/* ------------------------------------------------------------------ */

/**
 * Turns the approved script into narration segments and voice settings.
 *
 * This is an AI step: it decides delivery, pacing and where the natural breaks
 * are. It does not synthesise anything.
 */
export const voiceoverPlan: CapabilityHandler<z.infer<typeof voiceoverPlanResponseSchema>> = {
  capability: 'youtube.voiceover.plan',
  label: 'Plan narration',
  schemaName: 'VoiceoverPlan',
  schema: voiceoverPlanResponseSchema,

  async buildPrompt(ctx) {
    const script = await resolveScript(ctx);
    if (!script) throw new Error('No approved script was found to narrate.');
    const settings = await resolveSettings(
      ctx.store,
      ctx.ownerId,
      ctx.business?.id ?? ctx.task.business_id ?? '',
    );

    return [
      baseProductionContext(ctx),
      '',
      `Prepare the narration for "${script.title}".`,
      `Channel narration style: ${settings.narration_style}`,
      `Language: ${settings.language}`,
      '',
      'Script sections:',
      '```json',
      JSON.stringify(
        script.sections.map((s) => ({ kind: s.kind, heading: s.heading, body: s.body })),
        null,
        2,
      ).slice(0, 24_000),
      '```',
      '',
      'Rules:',
      '- `text` must be the words to speak, taken from the script. You may fix punctuation for delivery and expand numerals into words, but do not rewrite the content or add new claims.',
      '- One segment per script section, unless a section is long enough to need a natural break.',
      '- `direction` is a short delivery note for the voice, e.g. "slower, let the pause land".',
      '- Estimate duration at roughly 155 words per minute, adjusted for the pace you asked for.',
    ].join('\n');
  },

  async persist(ctx, data) {
    const script = await resolveScript(ctx);
    if (!script) throw new Error('No approved script was found to narrate.');
    const video = await resolveVideo(ctx);
    const businessId = ctx.business?.id ?? ctx.task.business_id ?? '';
    const settings = await resolveSettings(ctx.store, ctx.ownerId, businessId);
    const timestamp = new Date().toISOString();

    const voiceover: YoutubeVoiceover = {
      id: uuid(),
      business_id: businessId,
      video_id: video?.id ?? null,
      script_id: script.id,
      mission_id: ctx.task.mission_id,
      task_id: ctx.task.id,
      voice_provider: settings.voice_provider,
      voice_id: settings.voice_id,
      voice_name: settings.voice_name,
      speed: data.speed,
      settings: {},
      language: data.language || settings.language,
      narration_style: data.narration_style,
      segments: data.segments,
      audio_duration: null,
      audio_asset_id: null,
      generation_cost: 0,
      status: 'planned',
      error: null,
      is_demo: false,
      created_at: timestamp,
      updated_at: timestamp,
    };
    await ctx.store.insert('youtube_voiceovers', voiceover);

    if (video) {
      await setStage(ctx.store, video.id, 'voiceover', { voiceover_id: voiceover.id });
    }

    const totalSeconds = data.segments.reduce(
      (sum, segment) => sum + segment.estimated_duration_seconds,
      0,
    );
    return {
      summary: `planned narration — ${data.segments.length} segments, about ${Math.round(totalSeconds / 60)} minutes`,
      output: {
        voiceover_id: voiceover.id,
        video_id: video?.id ?? null,
        script_id: script.id,
        segments: data.segments.length,
        estimated_seconds: totalSeconds,
      },
    };
  },
};

/* ------------------------------------------------------------------ */
/* Generate                                                            */
/* ------------------------------------------------------------------ */

/**
 * Synthesises the narration audio.
 *
 * A provider step: it calls the configured voice provider, or blocks honestly
 * when there is none. It runs through the shared agent engine like every other
 * capability, so authority, cost and logging are handled once.
 */
export const voiceoverGenerate: CapabilityHandler = {
  capability: 'youtube.voiceover.generate',
  label: 'Generate narration',
  mode: 'provider',
  schemaName: 'VoiceoverGeneration',
  schema: voiceoverPlanResponseSchema as never,

  async run(ctx) {
    const video = await resolveVideo(ctx);
    const businessId = ctx.business?.id ?? ctx.task.business_id ?? '';

    const voiceoverId =
      (ctx.task.input.voiceover_id as string | undefined) ??
      (ctx.previousOutputs.voiceover_plan?.voiceover_id as string | undefined) ??
      (ctx.previousOutputs.voiceover?.voiceover_id as string | undefined);

    const voiceover = voiceoverId
      ? await ctx.store.get('youtube_voiceovers', voiceoverId)
      : (await ctx.store.list('youtube_voiceovers', { where: { business_id: businessId } })).find(
          (v) => v.video_id === video?.id,
        );

    if (!voiceover) {
      return blockProduction(ctx, video, 'No narration plan exists yet, so nothing can be spoken.');
    }

    const provider = getVoiceProvider();
    if (!provider.isConnected()) {
      await ctx.store.update('youtube_voiceovers', voiceover.id, {
        status: 'blocked',
        error: 'No voice provider is connected.',
        updated_at: new Date().toISOString(),
      });
      return blockProduction(
        ctx,
        video,
        `No voice provider is connected. Set ${provider.descriptor.requiredEnv.join(' and ')} on the server, then retry this step.`,
        { notifyKind: 'provider_required' },
      );
    }

    const text = voiceover.segments.map((segment) => segment.text).join('\n\n');
    const estimate = provider.estimateCost(text.length);

    // Spend is checked before anything is called, not after.
    if (estimate > 0 && !spendAuthorised(ctx)) {
      const check = await checkSpend(ctx.store, ctx.ownerId, businessId, video?.id ?? null, 'voice', estimate);
      if (check.exceedsCeiling) {
        return blockProduction(ctx, video, check.reason, { notifyKind: 'budget_exceeded' });
      }
      if (check.requiresApproval) {
        return requestSpendApproval(ctx, video, {
          estimate,
          category: 'narration',
          reason: `${provider.descriptor.name} would charge about £${estimate.toFixed(2)} to narrate ${text.length.toLocaleString('en-GB')} characters. ${check.reason}`,
          resumeInput: { voiceover_id: voiceover.id },
        });
      }
    }

    const queue = getJobQueue(ctx.store);
    const settings = await resolveSettings(ctx.store, ctx.ownerId, businessId);

    const job = await queue.run(
      {
        ownerId: ctx.ownerId,
        businessId,
        missionId: ctx.task.mission_id,
        videoId: video?.id ?? null,
        taskId: ctx.task.id,
        kind: 'voiceover',
        provider: provider.descriptor.name,
        input: { characters: text.length, voice_id: voiceover.voice_id || settings.voice_id },
        estimatedCost: estimate,
      },
      async ({ progress }) => {
        await progress(20, 'Narration submitted to the voice provider');
        const produced = await provider.generateSpeech({
          text,
          voiceId: voiceover.voice_id || settings.voice_id,
          speed: voiceover.speed,
          language: voiceover.language,
          settings: voiceover.settings,
        });
        await progress(70, 'Narration received, storing audio');

        const asset = await createMediaAsset(ctx.store, {
          ownerId: ctx.ownerId,
          businessId,
          missionId: ctx.task.mission_id,
          videoId: video?.id ?? null,
          taskId: ctx.task.id,
          type: 'voiceover',
          provider: provider.descriptor.name,
          providerAssetId: produced.providerAssetId ?? null,
          mimeType: produced.mimeType,
          extension: produced.extension,
          data: produced.data,
          duration: produced.durationSeconds ?? null,
          generationCost: produced.cost,
          simulated: produced.simulated,
          metadata: produced.metadata,
        });

        // Measure the real audio rather than trusting the estimate — every
        // downstream timing depends on this number.
        let measured = produced.durationSeconds ?? null;
        try {
          const localPath = await getMediaStorage().localPath(asset.storage_path!);
          const probe = await probeMedia(localPath);
          if (probe.durationSeconds) measured = probe.durationSeconds;
        } catch {
          /* keep the provider's figure if probing is unavailable */
        }
        if (measured && measured !== asset.duration) {
          await ctx.store.update('media_assets', asset.id, { duration: measured });
        }

        await progress(100);
        return {
          output: { asset_id: asset.id, duration: measured, simulated: produced.simulated },
          actualCost: produced.cost,
        };
      },
    );

    const assetId = job.output?.asset_id as string;
    const duration = (job.output?.duration as number | null) ?? null;
    const simulated = job.output?.simulated === true;
    const cost = job.actual_cost ?? 0;

    await ctx.store.update('youtube_voiceovers', voiceover.id, {
      audio_asset_id: assetId,
      audio_duration: duration,
      generation_cost: cost,
      status: 'ready',
      error: null,
      updated_at: new Date().toISOString(),
    });

    if (video) {
      await setStage(ctx.store, video.id, 'visual_plan', {
        voiceover_id: voiceover.id,
        blocked_reason: null,
        status: 'production',
        actual_cost: Number((video.actual_cost + cost).toFixed(4)),
      });
    }

    return {
      summary: `generated ${simulated ? 'simulated ' : ''}narration — ${duration ? `${Math.round(duration)}s` : 'unknown length'}`,
      output: {
        voiceover_id: voiceover.id,
        asset_id: assetId,
        duration,
        simulated,
        video_id: video?.id ?? null,
      },
      spend: cost > 0 ? { amount: cost, provider: provider.descriptor.name, product: 'speech' } : undefined,
    };
  },
};

/** Turns a provider failure into a blocked step rather than a crash. */
export function describeProviderFailure(error: unknown): string {
  if (isNotConnected(error)) return error.message;
  return error instanceof Error ? error.message : 'The provider failed for an unknown reason.';
}
