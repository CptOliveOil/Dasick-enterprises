import { z } from 'zod';

/* ------------------------------------------------------------------ */
/* Voiceover planning                                                  */
/* ------------------------------------------------------------------ */

export const voiceoverSegmentSchema = z.object({
  index: z.number().int().nonnegative(),
  section_heading: z.string().min(1),
  /** The exact words to speak. Must come from the approved script. */
  text: z.string().min(1),
  direction: z.string().default(''),
  estimated_duration_seconds: z.number().positive().max(1800),
});

export const voiceoverPlanResponseSchema = z.object({
  narration_style: z.string().min(3),
  language: z.string().min(2).max(12),
  /** 0.5–1.5 covers every sensible narration pace. */
  speed: z.number().min(0.5).max(1.5).default(1),
  segments: z.array(voiceoverSegmentSchema).min(1),
  notes: z.string().default(''),
});

export type VoiceoverPlanOutput = z.infer<typeof voiceoverPlanResponseSchema>;

/* ------------------------------------------------------------------ */
/* Visual planning                                                     */
/* ------------------------------------------------------------------ */

export const assetStrategySchema = z.enum([
  'generated_image',
  'generated_video',
  'stock',
  'text_motion',
  'screen_recording',
  'archive_public_source',
  'existing_asset',
]);

export const visualTypeSchema = z.enum(['image', 'video', 'text', 'archive', 'diagram']);

export const scenePlanSchema = z.object({
  scene_number: z.number().int().positive(),
  duration_estimate: z.number().positive().max(120),
  /** Verbatim from the script — the narration is not to be rewritten here. */
  narration_text: z.string().min(1),
  visual_type: visualTypeSchema,
  visual_description: z.string().min(5),
  image_prompt: z.string().default(''),
  video_prompt: z.string().default(''),
  stock_search_query: z.string().default(''),
  on_screen_text: z.string().max(120).default(''),
  animation_notes: z.string().default(''),
  transition: z.string().default('fade'),
  importance: z.number().int().min(1).max(5).default(3),
  asset_strategy: assetStrategySchema,
});

export const visualPlanResponseSchema = z.object({
  scenes: z.array(scenePlanSchema).min(1).max(120),
  /** Why the expensive strategies were chosen where they were. */
  strategy_rationale: z.string().default(''),
});

export type VisualPlanOutput = z.infer<typeof visualPlanResponseSchema>;

/* ------------------------------------------------------------------ */
/* Thumbnails                                                          */
/* ------------------------------------------------------------------ */

export const thumbnailConceptDetailSchema = z.object({
  concept_title: z.string().min(2),
  visual_description: z.string().min(10),
  subject: z.string().min(2),
  composition: z.string().min(3),
  background: z.string().min(3),
  /** Four words or fewer reads at 210×118. */
  text_overlay: z.string().max(60),
  facial_expression: z.string().default(''),
  contrast_strategy: z.string().min(3),
  click_psychology: z.string().min(5),
  image_prompt: z.string().min(10),
  confidence: z.number().min(0).max(1),
});

export const thumbnailPlanResponseSchema = z.object({
  concepts: z.array(thumbnailConceptDetailSchema).min(3).max(5),
  title_suggestions: z.array(z.string().min(4)).min(3).max(8),
  /** Pairings the strategist believes work together, by index. */
  recommended_pairings: z
    .array(
      z.object({
        title_index: z.number().int().nonnegative(),
        concept_index: z.number().int().nonnegative(),
        reasoning: z.string().min(5),
      }),
    )
    .default([]),
});

export type ThumbnailPlanOutput = z.infer<typeof thumbnailPlanResponseSchema>;

/* ------------------------------------------------------------------ */
/* Metadata                                                            */
/* ------------------------------------------------------------------ */

export const metadataResponseSchema = z.object({
  title: z.string().min(5).max(100),
  alternative_titles: z.array(z.string().min(4)).default([]),
  description: z.string().min(50).max(5000),
  short_description: z.string().max(300).default(''),
  tags: z.array(z.string().min(2)).max(30).default([]),
  hashtags: z.array(z.string()).max(6).default([]),
  chapters: z
    .array(z.object({ start_seconds: z.number().nonnegative(), title: z.string().min(2) }))
    .default([]),
  pinned_comment: z.string().max(600).default(''),
});

export type MetadataOutput = z.infer<typeof metadataResponseSchema>;

/* ------------------------------------------------------------------ */
/* Quality control                                                     */
/* ------------------------------------------------------------------ */

export const qualityIssueSchema = z.object({
  code: z.string().min(2),
  severity: z.enum(['info', 'warning', 'blocking']),
  message: z.string().min(5),
  remedy: z.string().min(5),
  scene_number: z.number().int().positive().nullable().default(null),
});

export const qualityCheckResponseSchema = z.object({
  verdict: z.enum(['pass', 'warning', 'fail']),
  summary: z.string().min(10),
  issues: z.array(qualityIssueSchema).default([]),
});

export type QualityCheckOutput = z.infer<typeof qualityCheckResponseSchema>;

/* ------------------------------------------------------------------ */
/* Timeline                                                            */
/* ------------------------------------------------------------------ */

export const timelineItemSchema = z.object({
  start: z.number().nonnegative(),
  end: z.number().positive(),
  scene_id: z.string().nullable().default(null),
  video_asset_id: z.string().nullable().default(null),
  audio_asset_id: z.string().nullable().default(null),
  text_overlay: z.string().default(''),
  transition: z.string().default('fade'),
  animation: z.enum(['zoom_in', 'zoom_out', 'pan_left', 'pan_right', 'none']).default('none'),
  volume: z.number().min(0).max(2).default(1),
  metadata: z.record(z.unknown()).default({}),
});

export const timelineSchema = z.object({
  items: z.array(timelineItemSchema).min(1),
  total_duration: z.number().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fps: z.number().int().positive(),
});

export type TimelineOutput = z.infer<typeof timelineSchema>;
