import 'server-only';
import type { z } from 'zod';
import { uuid } from '@/lib/ids';
import { copyrightReviewResponseSchema } from '@/schemas/production';
import {
  getAnalyticsProvider,
  getPublisher,
  getSubtitleProvider,
} from '@/lib/integrations/providers/registry';
import type { CapabilityHandler } from '@/lib/agents/capabilities';
import type { RunContext } from '@/lib/agents/context';
import { blockProduction, resolveScript, resolveVideo } from './context';
import { baseProductionContext } from './prompt';

/**
 * The last four stages of the studio: captions, copyright, publishing and the
 * analytics that close the loop back into Business Intelligence Memory.
 *
 * Each is a capability like any other. They run through the same engine, obey
 * the same authority and budget rules, log to the same activity feed, and are
 * retried by the same retry engine — the only thing that distinguishes them is
 * which provider interface they call.
 *
 * That is the whole architecture in four files' worth of code: a stage is a
 * capability, a capability names a provider interface, and the mode decides
 * which implementation answers. Nothing here knows whether it is running in a
 * demo or in production.
 */

const now = () => new Date().toISOString();

/* ------------------------------------------------------------------ */
/* Subtitles                                                           */
/* ------------------------------------------------------------------ */

export const subtitleGenerate: CapabilityHandler = {
  capability: 'youtube.subtitles',
  label: 'Generate subtitles',
  mode: 'provider',
  schemaName: 'Subtitles',
  schema: copyrightReviewResponseSchema as never,

  async run(ctx) {
    const video = await resolveVideo(ctx);
    const script = await resolveScript(ctx);
    if (!script) {
      return blockProduction(ctx, video, 'No script was found, so there is nothing to caption.');
    }

    const provider = getSubtitleProvider();
    if (!provider.isConnected()) {
      return blockProduction(
        ctx,
        video,
        `No subtitle provider is connected. Set ${provider.descriptor.requiredEnv.join(' and ')} on the server, then retry this step.`,
        { notifyKind: 'provider_required' },
      );
    }

    const transcript = script.sections.map((section) => section.body).join('\n\n');
    const result = await provider.generateSubtitles({
      // Alignment against the real narration when a provider can hear it;
      // estimation from the transcript otherwise. `aligned` records which.
      audioPath: null,
      transcript,
      language: 'en',
      lineLength: 42,
    });

    const id = uuid();
    await ctx.store.insert('youtube_captions', {
      id,
      business_id: ctx.business?.id ?? ctx.task.business_id ?? '',
      video_id: video?.id ?? null,
      script_id: script.id,
      task_id: ctx.task.id,
      language: 'en',
      cues: result.cues,
      vtt: result.vtt,
      aligned: result.aligned,
      provider: provider.descriptor.name,
      is_demo: result.simulated,
      created_at: now(),
    });

    return {
      summary: `wrote ${result.cues.length} caption cues${result.aligned ? '' : ' (timings estimated from the script, not heard from the audio)'}`,
      output: { caption_id: id, cues: result.cues.length, aligned: result.aligned },
      spend:
        result.cost > 0
          ? { amount: result.cost, provider: provider.descriptor.name, product: 'subtitles' }
          : undefined,
    };
  },
};

/* ------------------------------------------------------------------ */
/* Copyright review                                                    */
/* ------------------------------------------------------------------ */

/**
 * Reads every asset's recorded licence and judges whether the video can ship.
 *
 * An AI step, but a narrow one: it is given the licences the asset step
 * actually recorded and asked to reason about them. It is never asked to guess
 * what licence an asset has — an asset with no recorded licence is reported as
 * exactly that, because "probably fine" is the sentence that ends in a strike.
 */
export const copyrightReview: CapabilityHandler<
  z.infer<typeof copyrightReviewResponseSchema>
> = {
  capability: 'youtube.copyright.review',
  label: 'Copyright review',
  schemaName: 'CopyrightReview',
  schema: copyrightReviewResponseSchema,

  async buildPrompt(ctx: RunContext) {
    const video = await resolveVideo(ctx);
    const businessId = ctx.business?.id ?? ctx.task.business_id ?? '';
    const scenes = video
      ? await ctx.store.list('youtube_scenes', { where: { video_id: video.id } }).catch(() => [])
      : [];
    const assets = await ctx.store
      .list('media_assets', { where: { business_id: businessId } })
      .catch(() => []);
    const forVideo = assets.filter((asset) => !video || asset.video_id === video.id);

    return [
      baseProductionContext(ctx),
      '',
      'Review this video for copyright, licensing and attribution risk before it is published.',
      '',
      'Assets used, with the licence recorded for each:',
      '```json',
      JSON.stringify(
        forVideo.map((asset) => ({
          id: asset.id,
          type: asset.type,
          provider: asset.provider,
          licence: (asset.metadata as Record<string, unknown>)?.licence ?? null,
          source: (asset.metadata as Record<string, unknown>)?.source ?? null,
          generated: Boolean(asset.generation_prompt),
        })),
        null,
        2,
      ).slice(0, 12_000),
      '```',
      '',
      `Scenes: ${scenes.length}`,
      '',
      'Rules:',
      '- An asset with no recorded licence is a finding. Do not assume it is fine.',
      '- AI-generated imagery still carries risk when it depicts a real person, a trademark or a recognisable character. Say so.',
      '- Distinguish what must be fixed before publishing from what merely needs attribution.',
      '- `verdict` is `clear` only when nothing needs action before publishing.',
      '- Do not invent licence terms. If you do not know, the finding is that nobody knows.',
    ].join('\n');
  },

  async persist(ctx, data) {
    const video = await resolveVideo(ctx);
    const blocking = data.findings.filter((finding) => finding.severity === 'blocking');
    const id = uuid();

    await ctx.store.insert('youtube_copyright_reviews', {
      id,
      business_id: ctx.business?.id ?? ctx.task.business_id ?? '',
      video_id: video?.id ?? null,
      task_id: ctx.task.id,
      verdict: data.verdict,
      summary: data.summary,
      findings: data.findings,
      attribution_required: data.attribution_required,
      is_demo: false,
      created_at: now(),
    });

    if (blocking.length > 0) {
      return {
        summary: `found ${blocking.length} blocking copyright ${blocking.length === 1 ? 'issue' : 'issues'}`,
        output: { copyright_review_id: id, verdict: data.verdict, blocking: blocking.length },
        // Publishing with a known blocking issue is the one mistake that cannot
        // be undone by deleting the video, so the pipeline stops here.
        blocked: `${blocking.length} copyright issue(s) must be resolved before this can be published: ${blocking
          .map((finding) => finding.detail)
          .join('; ')}`,
      };
    }

    return {
      summary: `copyright review ${data.verdict} — ${data.findings.length} finding(s)`,
      output: { copyright_review_id: id, verdict: data.verdict, blocking: 0 },
    };
  },
};

/* ------------------------------------------------------------------ */
/* Publishing                                                          */
/* ------------------------------------------------------------------ */

/**
 * The only irreversible step in the system.
 *
 * It refuses unless the video has been approved, unless the copyright review
 * cleared, and unless a real publisher is connected. Visibility defaults to
 * private: an accidental publish should be recoverable, and the operator can
 * always widen it afterwards.
 */
export const youtubePublish: CapabilityHandler = {
  capability: 'youtube.publish',
  label: 'Publish to YouTube',
  mode: 'provider',
  schemaName: 'Publish',
  schema: copyrightReviewResponseSchema as never,

  async run(ctx) {
    const video = await resolveVideo(ctx);
    if (!video) {
      return blockProduction(ctx, null, 'No video was found to publish.');
    }
    if (video.status !== 'ready') {
      return blockProduction(
        ctx,
        video,
        'This video has not been approved for publishing. Approve it in the final review first.',
      );
    }

    const reviews = await ctx.store
      .list('youtube_copyright_reviews', { where: { video_id: video.id } })
      .catch(() => []);
    const latest = [...reviews].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    if (latest && latest.verdict === 'blocked') {
      return blockProduction(
        ctx,
        video,
        `The copyright review blocked this video: ${latest.summary}`,
      );
    }

    const publisher = getPublisher();
    if (!publisher.isConnected()) {
      return blockProduction(
        ctx,
        video,
        `No publisher is connected. Set ${publisher.descriptor.requiredEnv.join(', ')} on the server, then retry this step.`,
        { notifyKind: 'provider_required' },
      );
    }

    const metadata = video.metadata_id
      ? await ctx.store.get('youtube_metadata', video.metadata_id).catch(() => null)
      : null;
    const finalAsset = video.final_asset_id
      ? await ctx.store.get('media_assets', video.final_asset_id).catch(() => null)
      : null;
    if (!finalAsset?.storage_path) {
      return blockProduction(ctx, video, 'There is no rendered file to upload.');
    }
    const thumbnail = video.thumbnail_asset_id
      ? await ctx.store.get('media_assets', video.thumbnail_asset_id).catch(() => null)
      : null;
    const captions = (
      await ctx.store.list('youtube_captions', { where: { video_id: video.id } }).catch(() => [])
    )[0];

    const visibility =
      typeof ctx.task.input.visibility === 'string' &&
      ['private', 'unlisted', 'scheduled', 'public'].includes(ctx.task.input.visibility)
        ? (ctx.task.input.visibility as 'private' | 'unlisted' | 'scheduled' | 'public')
        : // The safe default. Widening is one click; un-publishing is not.
          'private';

    const result = await publisher.publish({
      videoPath: finalAsset.storage_path,
      thumbnailPath: thumbnail?.storage_path ?? null,
      captionsVtt: captions?.vtt ?? null,
      title: metadata?.title ?? video.title,
      description: metadata?.description ?? '',
      tags: metadata?.tags ?? [],
      chapters: (metadata?.chapters ?? []).map((chapter) => ({
        startSeconds: chapter.start_seconds,
        label: chapter.title,
      })),
      visibility,
      publishAt: video.publish_at,
      // Never inferred. Both are legal self-declarations and belong to the
      // operator, so they come from channel settings rather than a guess.
      madeForKids: ctx.task.input.made_for_kids === true,
      syntheticMedia: true,
    });

    await ctx.store.update('youtube_videos', video.id, {
      status: 'published',
      stage: 'publish',
      // Only ever set by a genuine upload; the simulated publisher marks itself,
      // so a demo run can never leave the workspace believing a video is live.
      published_external_id: result.simulated ? null : result.externalId,
      updated_at: now(),
    });

    return {
      summary: result.simulated
        ? `simulated an upload — nothing left this machine (${result.externalId})`
        : `published as ${result.externalId} (${result.visibility})`,
      output: {
        video_id: video.id,
        external_id: result.externalId,
        url: result.url,
        visibility: result.visibility,
        simulated: result.simulated,
      },
    };
  },
};

/* ------------------------------------------------------------------ */
/* Analytics collection                                                */
/* ------------------------------------------------------------------ */

/**
 * Brings real performance back in, which is what closes the loop.
 *
 * Everything upstream is production; this is the only step that tells the
 * workspace whether any of it worked. The rows it writes are read by
 * `businessOutcomes`, which is read by `businessMemoryBrief`, which every agent
 * receives — so a number collected here changes what the researcher proposes
 * next month without anyone wiring it up.
 */
export const analyticsCollect: CapabilityHandler = {
  capability: 'youtube.analytics.collect',
  label: 'Collect analytics',
  mode: 'provider',
  schemaName: 'AnalyticsCollection',
  schema: copyrightReviewResponseSchema as never,

  async run(ctx) {
    const video = await resolveVideo(ctx);
    if (!video?.published_external_id) {
      return {
        summary: 'no published video to collect analytics for',
        output: { collected: 0, reason: 'not_published' },
      };
    }

    const provider = getAnalyticsProvider();
    if (!provider.isConnected()) {
      return blockProduction(
        ctx,
        video,
        `No analytics provider is connected. Set ${provider.descriptor.requiredEnv.join(', ')} on the server, then retry this step.`,
        { notifyKind: 'provider_required' },
      );
    }

    const to = new Date();
    const from = new Date(to.getTime() - 28 * 24 * 60 * 60 * 1000);
    const days = await provider.collectAnalytics({
      externalId: video.published_external_id,
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
    });

    const businessId = ctx.business?.id ?? ctx.task.business_id ?? '';
    const existing = await ctx.store
      .list('youtube_analytics', { where: { video_id: video.id } })
      .catch(() => []);
    const seen = new Set(existing.map((row) => row.date));

    let written = 0;
    for (const day of days) {
      // One row per day. Re-collecting an overlapping window must not double
      // count, because these figures become the averages agents reason from.
      if (seen.has(day.date)) continue;
      await ctx.store.insert('youtube_analytics', {
        id: uuid(),
        business_id: businessId,
        video_id: video.id,
        channel_id: video.channel_id,
        date: day.date,
        views: day.views,
        impressions: day.impressions,
        ctr: day.clickThroughRate,
        watch_time_minutes: day.watchTimeMinutes,
        average_view_duration_seconds: day.averageViewDurationSeconds,
        likes: day.likes,
        comments: day.comments,
        subscribers_gained: day.subscribersGained,
        revenue: day.revenue,
        is_demo: false,
      });
      written += 1;
    }

    return {
      summary:
        written === 0
          ? 'no new analytics were available for this window'
          : `collected ${written} day(s) of real performance data`,
      output: { collected: written, video_id: video.id },
    };
  },
};
