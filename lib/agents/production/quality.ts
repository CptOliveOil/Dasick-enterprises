import 'server-only';
import type { z } from 'zod';
import { uuid } from '@/lib/ids';
import { metadataResponseSchema, qualityCheckResponseSchema } from '@/schemas/production';
import { assetLocalPath } from '@/lib/media/assets';
import { probeMedia } from '@/lib/media/ffmpeg';
import type { CapabilityHandler } from '@/lib/agents/capabilities';
import type {
  QualityIssue,
  YoutubeMetadata,
  YoutubeQualityCheck,
} from '@/types/production';
import { resolveScript, resolveVideo, setStage } from './context';
import { baseProductionContext } from './prompt';

/* ------------------------------------------------------------------ */
/* Metadata                                                            */
/* ------------------------------------------------------------------ */

/** Final title, description, tags and chapters for the published video. */
export const videoMetadata: CapabilityHandler<z.infer<typeof metadataResponseSchema>> = {
  capability: 'youtube.metadata',
  label: 'Write video metadata',
  schemaName: 'VideoMetadata',
  schema: metadataResponseSchema,

  async buildPrompt(ctx) {
    const script = await resolveScript(ctx);
    const video = await resolveVideo(ctx);
    const scenes = video
      ? (await ctx.store.list('youtube_scenes', { where: { video_id: video.id } })).sort(
          (a, b) => a.scene_number - b.scene_number,
        )
      : [];

    return [
      baseProductionContext(ctx),
      '',
      `Write the publishing metadata for "${script?.title ?? video?.title ?? 'this video'}".`,
      video?.alternative_titles.length
        ? `Titles the thumbnail strategist proposed: ${video.alternative_titles.join(' | ')}`
        : '',
      '',
      'Script sections:',
      '```json',
      JSON.stringify(
        script?.sections.map((s) => ({ heading: s.heading, body: s.body.slice(0, 900) })) ?? [],
        null,
        2,
      ).slice(0, 16_000),
      '```',
      '',
      scenes.length > 0
        ? `Scene start times, for chapters:\n${scenes
            .slice(0, 40)
            .map((s) => `${Math.round(s.start_time_estimate)}s — ${s.visual_direction.slice(0, 70)}`)
            .join('\n')}`
        : '',
      '',
      'Rules:',
      '- The description must open with two sentences that stand alone in search results, then give more detail.',
      '- Do not keyword-stuff. Tags should be phrases a person would actually search, not every permutation.',
      '- Chapters must start at 0 seconds and use the real scene times above.',
      '- No claims that are not in the script.',
      '- The pinned comment should invite a specific discussion, not beg for engagement.',
    ].join('\n');
  },

  async persist(ctx, data) {
    const video = await resolveVideo(ctx);
    if (!video) throw new Error('No video record exists to attach metadata to.');
    const businessId = ctx.business?.id ?? ctx.task.business_id ?? '';

    const existing = await ctx.store.list('youtube_metadata', { where: { video_id: video.id } });
    for (const row of existing) {
      await ctx.store.update('youtube_metadata', row.id, { selected: false });
    }

    const record: YoutubeMetadata = {
      id: uuid(),
      business_id: businessId,
      video_id: video.id,
      task_id: ctx.task.id,
      title: data.title,
      alternative_titles: data.alternative_titles,
      description: data.description,
      short_description: data.short_description,
      tags: data.tags,
      hashtags: data.hashtags,
      chapters: data.chapters,
      pinned_comment: data.pinned_comment,
      version: existing.length + 1,
      selected: true,
      is_demo: false,
      created_at: new Date().toISOString(),
    };
    await ctx.store.insert('youtube_metadata', record);
    await ctx.store.update('youtube_videos', video.id, {
      metadata_id: record.id,
      title: data.title,
      updated_at: new Date().toISOString(),
    });

    return {
      summary: `wrote publishing metadata — "${data.title}" with ${data.tags.length} tags and ${data.chapters.length} chapters`,
      output: { video_id: video.id, metadata_id: record.id, title: data.title },
    };
  },
};

/* ------------------------------------------------------------------ */
/* Quality control                                                     */
/* ------------------------------------------------------------------ */

/**
 * Reviews the finished package.
 *
 * Structural problems are found deterministically and the rendered file is
 * measured, not guessed. The model is then given those facts to judge the
 * editorial side — so a "pass" is never an opinion about a file nobody opened.
 */
export const qualityCheck: CapabilityHandler<z.infer<typeof qualityCheckResponseSchema>> = {
  capability: 'youtube.quality_check',
  label: 'Quality check',
  schemaName: 'QualityCheck',
  schema: qualityCheckResponseSchema,

  async buildPrompt(ctx) {
    const facts = await gatherFacts(ctx);
    return [
      baseProductionContext(ctx),
      '',
      'Review this finished video package before it goes to the operator for final approval.',
      '',
      'Measured and structural facts:',
      '```json',
      JSON.stringify(facts.report, null, 2).slice(0, 16_000),
      '```',
      '',
      facts.deterministic.length > 0
        ? `Checks already failed automatically:\n${facts.deterministic
            .map((i) => `- [${i.severity}] ${i.code}: ${i.message}`)
            .join('\n')}`
        : 'No automatic check failed.',
      '',
      'Rules:',
      '- Judge only what the facts support. Do not speculate about picture quality you cannot see.',
      '- `fail` means it must not be published as-is. `warning` means the operator should look but may proceed.',
      '- Any automatic check marked blocking makes the verdict `fail`.',
      '- Repeat the automatic issues in your own list so the operator sees one combined report.',
      '- Every issue needs a concrete `remedy`.',
    ].join('\n');
  },

  async persist(ctx, data) {
    const video = await resolveVideo(ctx);
    if (!video) throw new Error('No video record exists to check.');
    const businessId = ctx.business?.id ?? ctx.task.business_id ?? '';
    const facts = await gatherFacts(ctx);

    // Merge, de-duplicating by code; the automatic findings always win.
    const merged = new Map<string, QualityIssue>();
    for (const issue of data.issues) merged.set(issue.code, issue);
    for (const issue of facts.deterministic) merged.set(issue.code, issue);
    const issues = [...merged.values()];

    const blocking = issues.filter((i) => i.severity === 'blocking');
    const warnings = issues.filter((i) => i.severity === 'warning');
    const verdict = blocking.length > 0 ? 'fail' : warnings.length > 0 ? 'warning' : 'pass';

    const record: YoutubeQualityCheck = {
      id: uuid(),
      business_id: businessId,
      video_id: video.id,
      mission_id: ctx.task.mission_id,
      task_id: ctx.task.id,
      verdict,
      issues,
      summary: data.summary,
      measured: facts.measured,
      is_demo: false,
      created_at: new Date().toISOString(),
    };
    await ctx.store.insert('youtube_quality_checks', record);

    if (verdict === 'fail') {
      await ctx.store.update('youtube_videos', video.id, {
        status: 'blocked',
        blocked_reason: `Quality check failed: ${blocking[0]!.message}`,
        updated_at: new Date().toISOString(),
      });
      return {
        summary: `failed the quality check — ${blocking.length} blocking ${blocking.length === 1 ? 'issue' : 'issues'}`,
        output: { video_id: video.id, quality_check_id: record.id, verdict, issues: issues.length },
        blocked: `Quality check failed: ${blocking.map((i) => i.message).join('; ')}`,
      };
    }

    await setStage(ctx.store, video.id, 'final_approval', {
      status: 'awaiting_approval',
      blocked_reason: null,
    });

    const thumbnailAsset = video.thumbnail_asset_id
      ? await ctx.store.get('media_assets', video.thumbnail_asset_id)
      : null;

    return {
      summary:
        verdict === 'pass'
          ? `passed the quality check — no issues found`
          : `passed with ${warnings.length} ${warnings.length === 1 ? 'warning' : 'warnings'}`,
      output: {
        video_id: video.id,
        quality_check_id: record.id,
        verdict,
        issues: issues.length,
        measured: facts.measured,
      },
      approval: {
        kind: 'video',
        title: `Final approval: ${video.title}`,
        summary:
          `The video is rendered and has ${verdict === 'pass' ? 'passed' : `passed with ${warnings.length} warning(s) in`} quality control. ` +
          `${facts.measured.duration_seconds ? `${Math.round(facts.measured.duration_seconds)} seconds, ` : ''}` +
          `${thumbnailAsset ? 'thumbnail selected' : 'no thumbnail selected'}. ` +
          `Nothing is published until you approve.`,
        payload: {
          video_id: video.id,
          quality_check_id: record.id,
          verdict,
          final_asset_id: video.final_asset_id,
        },
      },
    };
  },
};

interface Facts {
  report: Record<string, unknown>;
  deterministic: QualityIssue[];
  measured: YoutubeQualityCheck['measured'];
}

/**
 * The deterministic half of QC: structural checks over stored records plus
 * measurements taken from the rendered file.
 */
async function gatherFacts(
  ctx: Parameters<NonNullable<CapabilityHandler['buildPrompt']>>[0],
): Promise<Facts> {
  const video = await resolveVideo(ctx);
  const issues: QualityIssue[] = [];
  const measured: YoutubeQualityCheck['measured'] = {
    duration_seconds: null,
    has_audio_track: null,
    width: null,
    height: null,
    file_size: null,
  };

  if (!video) {
    return {
      report: { error: 'no video record' },
      deterministic: [
        {
          code: 'no_video',
          severity: 'blocking',
          message: 'There is no video record to check.',
          remedy: 'Re-run the production workflow from the visual plan.',
          scene_number: null,
        },
      ],
      measured,
    };
  }

  const [scenes, assets, metadata, factChecks, timelines] = await Promise.all([
    ctx.store.list('youtube_scenes', { where: { video_id: video.id } }),
    ctx.store.list('media_assets', { where: { video_id: video.id } }),
    ctx.store.list('youtube_metadata', { where: { video_id: video.id } }),
    video.script_id
      ? ctx.store.list('youtube_fact_checks', { where: { script_id: video.script_id } })
      : Promise.resolve([]),
    ctx.store.list('youtube_timelines', { where: { video_id: video.id } }),
  ]);

  const ordered = scenes.slice().sort((a, b) => a.scene_number - b.scene_number);
  const timeline = timelines.find((t) => t.id === video.timeline_id) ?? timelines[0];

  if (ordered.length === 0) {
    issues.push({
      code: 'no_scenes',
      severity: 'blocking',
      message: 'The video has no scenes.',
      remedy: 'Run the visual plan step.',
      scene_number: null,
    });
  }

  for (const scene of ordered) {
    if (!scene.asset_id) {
      issues.push({
        code: 'missing_asset',
        severity: 'blocking',
        message: `Scene ${scene.scene_number} has no visual asset.`,
        remedy: 'Generate or upload an asset for this scene.',
        scene_number: scene.scene_number,
      });
    }
  }

  const seen = new Set<number>();
  for (const scene of ordered) {
    if (seen.has(scene.scene_number)) {
      issues.push({
        code: 'duplicate_scene',
        severity: 'warning',
        message: `Scene number ${scene.scene_number} appears more than once.`,
        remedy: 'Renumber or remove the duplicate in the scene editor.',
        scene_number: scene.scene_number,
      });
    }
    seen.add(scene.scene_number);
  }

  // Timeline gaps: an unintended hole between two items shows as a freeze.
  if (timeline) {
    for (let i = 1; i < timeline.items.length; i += 1) {
      const gap = timeline.items[i]!.start - timeline.items[i - 1]!.end;
      if (gap > 0.4) {
        issues.push({
          code: 'timeline_gap',
          severity: 'warning',
          message: `A ${gap.toFixed(1)}s gap sits before scene ${i + 1}.`,
          remedy: 'Re-run assembly so the timeline is rebuilt from the scenes.',
          scene_number: i + 1,
        });
      }
    }
  }

  const finalAsset = assets.find((a) => a.id === video.final_asset_id);
  if (!finalAsset) {
    issues.push({
      code: 'no_render',
      severity: 'blocking',
      message: 'No rendered video file exists.',
      remedy: 'Run the assembly step.',
      scene_number: null,
    });
  } else {
    measured.file_size = finalAsset.file_size;
    try {
      const probe = await probeMedia(await assetLocalPath(finalAsset));
      measured.duration_seconds = probe.durationSeconds;
      measured.has_audio_track = probe.hasAudioTrack;
      measured.width = probe.width;
      measured.height = probe.height;

      if (!probe.hasAudioTrack) {
        issues.push({
          code: 'no_audio_track',
          severity: 'blocking',
          message: 'The rendered file has no audio track.',
          remedy: 'Check the narration asset and re-run assembly.',
          scene_number: null,
        });
      }
      if (probe.durationSeconds && timeline) {
        const drift = Math.abs(probe.durationSeconds - timeline.total_duration);
        if (drift > 3) {
          issues.push({
            code: 'duration_mismatch',
            severity: 'warning',
            message: `The rendered file is ${Math.round(probe.durationSeconds)}s but the timeline plans ${Math.round(timeline.total_duration)}s.`,
            remedy: 'Re-run assembly, or accept the drift if it is only trailing silence.',
            scene_number: null,
          });
        }
      }
    } catch {
      issues.push({
        code: 'unreadable_render',
        severity: 'warning',
        message: 'The rendered file could not be measured.',
        remedy: 'Confirm the file exists in storage and re-run assembly if not.',
        scene_number: null,
      });
    }
  }

  if (!video.thumbnail_asset_id) {
    issues.push({
      code: 'no_thumbnail',
      severity: 'warning',
      message: 'No thumbnail has been selected.',
      remedy: 'Choose one in YouTube → Production → Thumbnails.',
      scene_number: null,
    });
  }

  const selectedMetadata = metadata.find((m) => m.selected);
  if (!selectedMetadata) {
    issues.push({
      code: 'no_metadata',
      severity: 'blocking',
      message: 'The video has no title or description.',
      remedy: 'Run the metadata step.',
      scene_number: null,
    });
  } else if (!selectedMetadata.description.trim()) {
    issues.push({
      code: 'no_description',
      severity: 'warning',
      message: 'The description is empty.',
      remedy: 'Re-run the metadata step.',
      scene_number: null,
    });
  }

  if (!assets.some((a) => a.type === 'subtitle_file')) {
    issues.push({
      code: 'no_captions',
      severity: 'info',
      message: 'No caption file was produced.',
      remedy: 'Enable captions in YouTube → Settings and re-run assembly.',
      scene_number: null,
    });
  }

  const unresolved = factChecks
    .flatMap((fc) => fc.findings)
    .filter((f) => f.verdict === 'potentially_incorrect');
  if (unresolved.length > 0) {
    issues.push({
      code: 'unresolved_fact_check',
      severity: 'blocking',
      message: `${unresolved.length} fact-check finding(s) remain marked potentially incorrect.`,
      remedy: 'Revise the script and re-run the fact check.',
      scene_number: null,
    });
  }

  const simulated = assets.filter((a) => a.simulated);
  if (simulated.length > 0) {
    issues.push({
      code: 'simulated_assets',
      severity: 'warning',
      message: `${simulated.length} asset(s) are simulated Demo Mode placeholders, not real media.`,
      remedy: 'Connect real media providers before publishing this video anywhere.',
      scene_number: null,
    });
  }

  return {
    report: {
      scene_count: ordered.length,
      scenes_with_assets: ordered.filter((s) => s.asset_id).length,
      timeline_duration: timeline?.total_duration ?? null,
      measured,
      has_thumbnail: Boolean(video.thumbnail_asset_id),
      metadata_title: selectedMetadata?.title ?? null,
      caption_files: assets.filter((a) => a.type === 'subtitle_file').length,
      simulated_assets: simulated.length,
      unresolved_fact_check_findings: unresolved.length,
    },
    deterministic: issues,
    measured,
  };
}
