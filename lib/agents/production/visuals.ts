import 'server-only';
import type { z } from 'zod';
import { visualPlanResponseSchema } from '@/schemas/production';
import { newScene } from '@/lib/production/defaults';
import type { CapabilityHandler } from '@/lib/agents/capabilities';
import type { YoutubeScene } from '@/types/domain';
import { resolveScript, resolveSettings, resolveVideo, setStage } from './context';
import { baseProductionContext } from './prompt';
import { islamicContext } from '@/lib/islamic/resolve';
import { renderVisualRules, violatedVisualRules } from '@/lib/islamic/policy';

/**
 * Turns the approved script into a scene-by-scene visual plan.
 *
 * The Visual Director chooses each scene's asset strategy, and is told to reach
 * for the expensive options only where they earn it — most documentary scenes
 * do not need generated video.
 */
export const visualPlan: CapabilityHandler<z.infer<typeof visualPlanResponseSchema>> = {
  capability: 'youtube.visual_plan',
  label: 'Plan visuals',
  schemaName: 'VisualPlan',
  schema: visualPlanResponseSchema,

  async buildPrompt(ctx) {
    const script = await resolveScript(ctx);
    if (!script) throw new Error('No approved script was found to plan visuals for.');

    // Channel visual restrictions reach the Visual Director as constraints, and
    // are checked again after the plan comes back.
    const { rules } = await islamicContext(
      ctx.store,
      ctx.ownerId,
      ctx.business?.id ?? ctx.task.business_id,
    );
    const constraints = renderVisualRules(rules);

    const voiceovers = await ctx.store.list('youtube_voiceovers', {
      where: { script_id: script.id },
    });
    const voiceover = voiceovers.find((v) => v.status === 'ready') ?? voiceovers[0];
    const measured = voiceover?.audio_duration ?? null;

    return [
      baseProductionContext(ctx),
      '',
      constraints,
      constraints ? '' : '',
      `Plan the visuals for "${script.title}".`,
      measured
        ? `The narration audio is ${Math.round(measured)} seconds long. Your scene durations must add up to approximately that, not to an arbitrary figure.`
        : `Estimate from the script: roughly ${Math.round(script.estimated_duration_seconds)} seconds of narration.`,
      '',
      'Narration to cover:',
      '```json',
      JSON.stringify(
        voiceover?.segments.map((s) => ({ index: s.index, heading: s.section_heading, text: s.text })) ??
          script.sections.map((s, i) => ({ index: i, heading: s.heading, text: s.body })),
        null,
        2,
      ).slice(0, 24_000),
      '```',
      '',
      'Asset strategies, cheapest first:',
      '- `text_motion`: on-screen text over a plain background. Free. Good for statistics, quotes and chapter breaks.',
      '- `archive_public_source`: a genuinely public-domain or openly licensed historical image. Free, but only name one if you are confident it exists and is free to use.',
      '- `stock`: a stock library search. Cheap. Give a literal search query.',
      '- `generated_image`: a still from an image model. Moderate cost. The default for most documentary scenes.',
      '- `generated_video`: a clip from a video model. Expensive — use it only where motion genuinely carries meaning, and for no more than a fifth of the scenes.',
      '',
      'Rules:',
      '- `narration_text` must be taken verbatim from the narration above. Do not rewrite it.',
      '- Scenes run 6–25 seconds. A scene that would run longer should be split.',
      '- `image_prompt` and `video_prompt` must be usable as-is, and must never request a recognisable real person or a copyrighted character.',
      '- `on_screen_text` is optional and should be short. Leave it empty when the narration is enough.',
      '- `importance` marks which scenes deserve the spend: 5 for the shot the video needs, 1 for filler.',
      '- Explain your cost choices in `strategy_rationale`.',
      constraints
        ? '- The visual constraints above override every other instruction here. A scene that breaks one is rejected and the plan has to be redone.'
        : '',
    ]
      .filter((part) => part !== '')
      .join('\n');
  },

  async persist(ctx, data) {
    const video = await resolveVideo(ctx);
    if (!video) throw new Error('No video record exists to attach scenes to.');
    const businessId = ctx.business?.id ?? ctx.task.business_id ?? '';
    const settings = await resolveSettings(ctx.store, ctx.ownerId, businessId);
    const { rules } = await islamicContext(ctx.store, ctx.ownerId, businessId);

    // The constraints were in the prompt; this is the check that they were
    // followed. A restriction that exists only as a request in a prompt is not
    // a restriction, and this is the difference between the two.
    const violations = data.scenes.flatMap((scene) =>
      violatedVisualRules(
        {
          scene_number: scene.scene_number,
          image_prompt: scene.image_prompt,
          video_prompt: scene.video_prompt,
          visual_direction: scene.visual_description,
          on_screen_text: scene.on_screen_text,
        },
        rules,
      ),
    );

    if (violations.length > 0) {
      // Nothing is written. A plan that breaks the channel's visual rules must
      // not leave scenes behind for the Asset Agent to pick up.
      return {
        summary: `produced a plan that breaks ${violations.length} visual rule${violations.length === 1 ? '' : 's'}`,
        output: { video_id: video.id, violations, scene_count: 0 },
        blocked:
          `The visual plan breaks this channel's visual rules and was not saved. ${violations.slice(0, 3).join(' ')}`.slice(
            0,
            600,
          ),
      };
    }

    // Replanning replaces the previous plan rather than accumulating scenes.
    const existing = await ctx.store.list('youtube_scenes', { where: { video_id: video.id } });
    for (const scene of existing) {
      await ctx.store.remove('youtube_scenes', scene.id);
    }

    let elapsed = 0;
    const rows: YoutubeScene[] = data.scenes
      .slice()
      .sort((a, b) => a.scene_number - b.scene_number)
      .map((scene) => {
        const row = newScene({
          video_id: video.id,
          business_id: businessId,
          mission_id: ctx.task.mission_id,
          scene_number: scene.scene_number,
          start_time_estimate: Number(elapsed.toFixed(2)),
          duration_seconds: scene.duration_estimate,
          narration: scene.narration_text,
          visual_type: scene.visual_type,
          visual_direction: scene.visual_description,
          b_roll_query: scene.stock_search_query,
          image_prompt: scene.image_prompt,
          video_prompt: scene.video_prompt,
          on_screen_text: scene.on_screen_text,
          animation_notes: scene.animation_notes,
          transition: scene.transition,
          importance: scene.importance,
          asset_strategy: scene.asset_strategy,
          asset_status: 'pending',
          status: 'awaiting_asset',
        });
        elapsed += scene.duration_estimate;
        return row;
      });
    await ctx.store.insertMany('youtube_scenes', rows);

    await setStage(ctx.store, video.id, 'assets', { blocked_reason: null });

    const counts = rows.reduce<Record<string, number>>((acc, row) => {
      acc[row.asset_strategy] = (acc[row.asset_strategy] ?? 0) + 1;
      return acc;
    }, {});

    return {
      summary: `planned ${rows.length} scenes covering ${Math.round(elapsed / 60)} minutes`,
      output: {
        video_id: video.id,
        scene_count: rows.length,
        total_seconds: Number(elapsed.toFixed(2)),
        strategies: counts,
        rationale: data.strategy_rationale,
        width: settings.width,
        height: settings.height,
      },
    };
  },
};
