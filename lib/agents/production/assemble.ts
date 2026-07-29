import 'server-only';
import path from 'node:path';
import { uuid } from '@/lib/ids';
import { timelineSchema } from '@/schemas/production';
import { assetLocalPath, createMediaAsset } from '@/lib/media/assets';
import { buildAss, buildCues, toSrt, toVtt, type AssOverlay } from '@/lib/media/captions';
import { containsArabic } from '@/lib/islamic/arabic';
import { probeMedia, readOutput, withTempDir } from '@/lib/media/ffmpeg';
import { getVideoRenderer } from '@/lib/integrations/providers/registry';
import { getJobQueue } from '@/lib/jobs/queue';
import type { CapabilityHandler, PersistResult } from '@/lib/agents/capabilities';
import type { MediaAsset } from '@/types/production';
import type {
  TimelineItem,
  YoutubeRenderJob,
  YoutubeTimeline,
} from '@/types/production';
import { blockProduction, resolveSettings, resolveVideo, setStage } from './context';

/**
 * Builds the timeline and renders the video.
 *
 * A provider step. The timeline is derived from real scenes and the measured
 * narration length; the render runs through the `VideoRenderer` interface, so
 * swapping ffmpeg for a cloud renderer later touches nothing here.
 */
export const videoAssemble: CapabilityHandler = {
  capability: 'youtube.video_assemble',
  label: 'Assemble video',
  mode: 'provider',
  schemaName: 'Timeline',
  schema: timelineSchema as never,

  async run(ctx): Promise<PersistResult> {
    const video = await resolveVideo(ctx);
    if (!video) return blockProduction(ctx, null, 'No video record exists to assemble.');

    const businessId = ctx.business?.id ?? ctx.task.business_id ?? '';
    const settings = await resolveSettings(ctx.store, ctx.ownerId, businessId);
    const renderer = getVideoRenderer();

    if (!renderer.isConnected()) {
      return blockProduction(
        ctx,
        video,
        'No video renderer is available on this server, so nothing can be assembled.',
        { notifyKind: 'provider_required' },
      );
    }

    const scenes = (await ctx.store.list('youtube_scenes', { where: { video_id: video.id } }))
      .slice()
      .sort((a, b) => a.scene_number - b.scene_number);
    if (scenes.length === 0) {
      return blockProduction(ctx, video, 'There is no scene plan, so there is nothing to assemble.');
    }

    const missingAssets = scenes.filter((scene) => !scene.asset_id);
    if (missingAssets.length > 0) {
      return blockProduction(
        ctx,
        video,
        `${missingAssets.length} of ${scenes.length} scenes have no asset (first: scene ${missingAssets[0]!.scene_number}). Source them before assembling.`,
      );
    }

    // --- Narration --------------------------------------------------------
    const voiceovers = await ctx.store.list('youtube_voiceovers', {
      where: { business_id: businessId },
    });
    const voiceover =
      voiceovers.find((v) => v.id === video.voiceover_id) ??
      voiceovers.find((v) => v.video_id === video.id);
    const narrationAsset =
      voiceover?.audio_asset_id
        ? await ctx.store.get('media_assets', voiceover.audio_asset_id)
        : null;

    if (!narrationAsset || narrationAsset.status !== 'ready') {
      return blockProduction(
        ctx,
        video,
        'The narration audio is not ready, so the video cannot be assembled against it.',
      );
    }

    // --- Timeline ---------------------------------------------------------
    // Scene durations are scaled to the measured narration so picture and
    // audio genuinely line up rather than approximately.
    const plannedTotal = scenes.reduce((sum, s) => sum + s.duration_seconds, 0);
    const narrationLength = narrationAsset.duration ?? plannedTotal;
    const scale = plannedTotal > 0 ? narrationLength / plannedTotal : 1;

    const sceneAssets = new Map<string, MediaAsset>();
    for (const scene of scenes) {
      const asset = await ctx.store.get('media_assets', scene.asset_id!);
      if (!asset || asset.status !== 'ready' || !asset.storage_path) {
        return blockProduction(
          ctx,
          video,
          `Scene ${scene.scene_number} points at an asset that is not usable. Replace it in the scene editor.`,
        );
      }
      sceneAssets.set(scene.id, asset);
    }

    let cursor = 0;
    const items: TimelineItem[] = scenes.map((scene, index) => {
      const duration = Math.max(1.5, Number((scene.duration_seconds * scale).toFixed(3)));
      const item: TimelineItem = {
        start: Number(cursor.toFixed(3)),
        end: Number((cursor + duration).toFixed(3)),
        scene_id: scene.id,
        video_asset_id: scene.asset_id,
        audio_asset_id: null,
        text_overlay: scene.on_screen_text,
        transition: index === 0 ? 'cut' : scene.transition,
        animation: pickAnimation(scene.animation_notes, index),
        volume: 1,
        metadata: { scene_number: scene.scene_number, strategy: scene.asset_strategy },
      };
      cursor += duration;
      return item;
    });

    const timestamp = new Date().toISOString();
    const timeline: YoutubeTimeline = {
      id: uuid(),
      business_id: businessId,
      video_id: video.id,
      mission_id: ctx.task.mission_id,
      task_id: ctx.task.id,
      items,
      total_duration: Number(cursor.toFixed(3)),
      width: settings.width,
      height: settings.height,
      fps: settings.fps,
      narration_asset_id: narrationAsset.id,
      music_asset_id: settings.music_mode === 'uploaded' ? settings.music_asset_id : null,
      subtitle_asset_id: null,
      burn_in_captions: settings.burn_in_captions,
      status: 'ready',
      is_demo: false,
      created_at: timestamp,
      updated_at: timestamp,
    };
    await ctx.store.insert('youtube_timelines', timeline);

    // --- Captions ---------------------------------------------------------
    let subtitleAssetId: string | null = null;
    let cues: ReturnType<typeof buildCues> = [];
    if (settings.captions_enabled) {
      cues = buildCues(
        scenes.map((scene, i) => ({
          text: scene.narration,
          start: items[i]!.start,
          duration: items[i]!.end - items[i]!.start,
        })),
      );
      const srt = await createMediaAsset(ctx.store, {
        ownerId: ctx.ownerId,
        businessId,
        missionId: ctx.task.mission_id,
        videoId: video.id,
        taskId: ctx.task.id,
        type: 'subtitle_file',
        provider: 'local',
        mimeType: 'application/x-subrip',
        extension: 'srt',
        data: Buffer.from(toSrt(cues), 'utf8'),
        metadata: { format: 'srt', cues: cues.length },
      });
      await createMediaAsset(ctx.store, {
        ownerId: ctx.ownerId,
        businessId,
        missionId: ctx.task.mission_id,
        videoId: video.id,
        taskId: ctx.task.id,
        type: 'subtitle_file',
        provider: 'local',
        mimeType: 'text/vtt',
        extension: 'vtt',
        data: Buffer.from(toVtt(cues), 'utf8'),
        metadata: { format: 'vtt', cues: cues.length },
      });
      subtitleAssetId = srt.id;
      await ctx.store.update('youtube_timelines', timeline.id, { subtitle_asset_id: srt.id });
    }

    // --- Render -----------------------------------------------------------
    const renderRecord: YoutubeRenderJob = {
      id: uuid(),
      business_id: businessId,
      video_id: video.id,
      timeline_id: timeline.id,
      mission_id: ctx.task.mission_id,
      task_id: ctx.task.id,
      job_id: null,
      renderer: renderer.descriptor.name,
      status: 'queued',
      progress: 0,
      output_asset_id: null,
      log: '',
      error: null,
      duration_ms: null,
      is_demo: false,
      created_at: timestamp,
      updated_at: timestamp,
    };
    await ctx.store.insert('youtube_render_jobs', renderRecord);

    const queue = getJobQueue(ctx.store);
    let finalAssetId: string | null = null;
    let measuredDuration: number | null = null;
    let renderLog = '';

    try {
      const job = await queue.run(
        {
          ownerId: ctx.ownerId,
          businessId,
          missionId: ctx.task.mission_id,
          videoId: video.id,
          taskId: ctx.task.id,
          kind: 'render',
          provider: renderer.descriptor.name,
          input: { scenes: scenes.length, duration: timeline.total_duration },
        },
        async ({ job, progress }) => {
          await ctx.store.update('youtube_render_jobs', renderRecord.id, {
            job_id: job.id,
            status: 'processing',
            updated_at: new Date().toISOString(),
          });

          return withTempDir(async (dir) => {
            // Overlays: on-screen text plus captions when they are burned in.
            const overlays: AssOverlay[] = [];
            for (const item of items) {
              if (item.text_overlay.trim()) {
                overlays.push({
                  start: item.start,
                  end: Math.min(item.end, item.start + 4.5),
                  // Arabic gets the Arabic style, which names fonts that can
                  // shape it. This is the only route by which Arabic reaches
                  // the screen: it is drawn from the stored text through
                  // libass, never generated as pixels by an image model.
                  text: item.text_overlay,
                  style: containsArabic(item.text_overlay) ? 'arabic' : 'title',
                });
              }
            }
            if (settings.burn_in_captions) {
              for (const cue of cues) {
                overlays.push({ start: cue.start, end: cue.end, text: cue.text, style: 'caption' });
              }
            }

            let assPath: string | null = null;
            if (overlays.length > 0) {
              const { writeFile } = await import('node:fs/promises');
              assPath = path.join(dir, 'overlay.ass');
              await writeFile(
                assPath,
                buildAss(overlays, { width: settings.width, height: settings.height }),
              );
            }

            const clips = [];
            for (const [index, item] of items.entries()) {
              const asset = sceneAssets.get(item.scene_id!)!;
              clips.push({
                filePath: await assetLocalPath(asset),
                kind: asset.type === 'video_clip' ? ('video' as const) : ('image' as const),
                durationSeconds: item.end - item.start,
                animation: item.animation,
                transition: index === 0 ? 'cut' : item.transition,
              });
            }

            await progress(15, `Rendering ${clips.length} scenes`);

            const musicAsset = timeline.music_asset_id
              ? await ctx.store.get('media_assets', timeline.music_asset_id)
              : null;

            const outputPath = path.join(dir, 'final.mp4');
            const result = await renderer.renderTimeline({
              jobId: job.id,
              width: settings.width,
              height: settings.height,
              fps: settings.fps,
              clips,
              narrationPath: await assetLocalPath(narrationAsset),
              musicPath: musicAsset?.storage_path ? await assetLocalPath(musicAsset) : null,
              musicVolume: settings.music_volume,
              musicFadeIn: settings.music_fade_in,
              musicFadeOut: settings.music_fade_out,
              assPath,
              outputPath,
              onProgress: () => undefined,
            });
            renderLog = result.log;

            await progress(85, 'Render complete, storing the file');
            const probe = await probeMedia(outputPath);
            measuredDuration = probe.durationSeconds;

            const asset = await createMediaAsset(ctx.store, {
              ownerId: ctx.ownerId,
              businessId,
              missionId: ctx.task.mission_id,
              videoId: video.id,
              taskId: ctx.task.id,
              type: 'final_video',
              provider: renderer.descriptor.name,
              mimeType: 'video/mp4',
              extension: 'mp4',
              data: await readOutput(outputPath),
              duration: probe.durationSeconds,
              width: probe.width,
              height: probe.height,
              // The render itself is real even when its inputs were simulated;
              // the scene assets carry that flag individually.
              simulated: false,
              metadata: {
                scenes: clips.length,
                has_audio_track: probe.hasAudioTrack,
                contains_simulated_assets: [...sceneAssets.values()].some((a) => a.simulated),
              },
            });
            finalAssetId = asset.id;

            await progress(100);
            return {
              output: { asset_id: asset.id, duration: probe.durationSeconds },
              actualCost: 0,
            };
          });
        },
      );

      await ctx.store.update('youtube_render_jobs', renderRecord.id, {
        status: 'completed',
        progress: 100,
        output_asset_id: finalAssetId,
        log: renderLog.slice(0, 4000),
        duration_ms: job.completed_at
          ? new Date(job.completed_at).getTime() - new Date(job.created_at).getTime()
          : null,
        updated_at: new Date().toISOString(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The render failed.';
      await ctx.store.update('youtube_render_jobs', renderRecord.id, {
        status: 'failed',
        error: message,
        log: renderLog.slice(0, 4000),
        updated_at: new Date().toISOString(),
      });
      await ctx.store.update('youtube_timelines', timeline.id, { status: 'failed' });
      return blockProduction(ctx, video, `Render failed — ${message}`, {
        notifyKind: 'render_failed',
      });
    }

    await ctx.store.update('youtube_timelines', timeline.id, { status: 'rendered' });
    await setStage(ctx.store, video.id, 'quality_check', {
      timeline_id: timeline.id,
      final_asset_id: finalAssetId,
      blocked_reason: null,
      status: 'production',
    });

    return {
      summary: `assembled the video — ${scenes.length} scenes, ${measuredDuration ? `${Math.round(measuredDuration)}s` : 'unknown length'}`,
      output: {
        video_id: video.id,
        timeline_id: timeline.id,
        final_asset_id: finalAssetId,
        duration: measuredDuration,
        subtitle_asset_id: subtitleAssetId,
        scenes: scenes.length,
      },
    };
  },
};

/** Alternates Ken Burns direction so consecutive stills do not move identically. */
function pickAnimation(notes: string, index: number): TimelineItem['animation'] {
  const hint = notes.toLowerCase();
  if (hint.includes('zoom out')) return 'zoom_out';
  if (hint.includes('zoom in')) return 'zoom_in';
  if (hint.includes('pan left')) return 'pan_left';
  if (hint.includes('pan right')) return 'pan_right';
  if (hint.includes('static') || hint.includes('hold')) return 'none';
  const cycle: TimelineItem['animation'][] = ['zoom_in', 'pan_right', 'zoom_out', 'pan_left'];
  return cycle[index % cycle.length]!;
}
