import { z } from 'zod';

const score = z.number().min(0).max(100);

export const opportunityBreakdownSchema = z.object({
  demand: score,
  competition: score,
  monetisation: score,
  longevity: score,
  click_potential: score,
});

export const youtubeIdeaSchema = z.object({
  title: z.string().min(4).max(160),
  topic: z.string().min(2),
  niche: z.string().min(2),
  summary: z.string().min(20),
  target_audience: z.string().min(3),
  why_it_might_work: z.string().min(10),
  competition: z.string().min(3),
  demand: z.string().min(3),
  monetisation: z.string().min(3),
  longevity: z.string().min(3),
  click_potential: z.string().min(3),
  difficulty: z.string().min(3),
  /** 0–1. The model's own confidence, not a marketing number. */
  confidence: z.number().min(0).max(1),
  sources: z.array(z.string()).default([]),
  notes: z.string().default(''),
  breakdown: opportunityBreakdownSchema,
});

export const youtubeIdeasResponseSchema = z.object({
  ideas: z.array(youtubeIdeaSchema).min(1).max(25),
});

export type YoutubeIdeaOutput = z.infer<typeof youtubeIdeaSchema>;

/* ------------------------------------------------------------------ */

const claimConfidence = z.enum(['verified', 'interpretation', 'needs_verification']);

export const researchFactSchema = z.object({
  claim: z.string().min(3),
  detail: z.string().default(''),
  confidence: claimConfidence,
  source: z.string().nullable().default(null),
});

export const youtubeResearchResponseSchema = z.object({
  overview: z.string().min(40),
  facts: z.array(researchFactSchema).min(1),
  statistics: z.array(researchFactSchema).default([]),
  timeline: z.array(z.object({ when: z.string(), what: z.string() })).default([]),
  viewer_questions: z.array(z.string()).default([]),
  competitor_coverage: z.array(z.string()).default([]),
  content_gaps: z.array(z.string()).default([]),
  hooks: z.array(z.string()).min(1),
  interesting_details: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  uncertain_claims: z.array(z.string()).default([]),
});

export type YoutubeResearchOutput = z.infer<typeof youtubeResearchResponseSchema>;

/* ------------------------------------------------------------------ */

export const scriptSectionSchema = z.object({
  kind: z.enum([
    'hook',
    'introduction',
    'main',
    'transition',
    'pattern_interrupt',
    'payoff',
    'ending',
    'cta',
  ]),
  heading: z.string().min(2),
  body: z.string().min(10),
});

export const youtubeScriptResponseSchema = z.object({
  title: z.string().min(4),
  tone: z.string().min(3),
  audience: z.string().min(3),
  goal: z.string().min(3),
  sections: z.array(scriptSectionSchema).min(3),
});

export type YoutubeScriptOutput = z.infer<typeof youtubeScriptResponseSchema>;

/* ------------------------------------------------------------------ */

export const factCheckFindingSchema = z.object({
  claim: z.string().min(3),
  verdict: z.enum(['verified', 'needs_review', 'potentially_incorrect', 'unsourced']),
  reasoning: z.string().min(5),
  suggested_correction: z.string().nullable().default(null),
});

export const factCheckResponseSchema = z.object({
  summary: z.string().min(10),
  findings: z.array(factCheckFindingSchema).default([]),
});

export type FactCheckOutput = z.infer<typeof factCheckResponseSchema>;

/* ------------------------------------------------------------------ */

export const thumbnailConceptSchema = z.object({
  visual_description: z.string().min(10),
  subject: z.string().min(3),
  background: z.string().min(3),
  composition: z.string().min(3),
  text: z.string().max(60),
  emotion: z.string().min(3),
  colour_direction: z.string().min(3),
  reasoning: z.string().min(10),
});

export const thumbnailResponseSchema = z.object({
  concepts: z.array(thumbnailConceptSchema).min(1).max(8),
  alternative_titles: z.array(z.string()).min(1).max(12),
});

export type ThumbnailOutput = z.infer<typeof thumbnailResponseSchema>;

/* ------------------------------------------------------------------ */

export const sceneSchema = z.object({
  scene_number: z.number().int().positive(),
  duration_seconds: z.number().positive().max(120),
  narration: z.string().min(5),
  visual_direction: z.string().min(5),
  b_roll_query: z.string().default(''),
  image_prompt: z.string().default(''),
  video_prompt: z.string().default(''),
  on_screen_text: z.string().default(''),
  transition: z.string().default('cut'),
});

export const productionPlanResponseSchema = z.object({
  scenes: z.array(sceneSchema).min(1),
});

export type ProductionPlanOutput = z.infer<typeof productionPlanResponseSchema>;

/* ------------------------------------------------------------------ */

export const channelAnalysisResponseSchema = z.object({
  best_topics: z.array(z.string()).default([]),
  best_title_structures: z.array(z.string()).default([]),
  thumbnail_patterns: z.array(z.string()).default([]),
  ideal_duration: z.string().default('Unknown — insufficient data'),
  retention_trends: z.array(z.string()).default([]),
  best_publishing_periods: z.array(z.string()).default([]),
  caveats: z.array(z.string()).default([]),
});

export type ChannelAnalysisOutput = z.infer<typeof channelAnalysisResponseSchema>;
