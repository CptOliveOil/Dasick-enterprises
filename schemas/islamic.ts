import { z } from 'zod';
import {
  HADITH_GRADINGS,
  SOURCE_CATEGORIES,
  VERIFICATION_STATUSES,
} from '@/types/islamic';

/**
 * Structured output for Islamic research and source verification.
 *
 * Two things about this schema are load-bearing.
 *
 * First, **nullable rather than optional**. A model asked for an optional field
 * will usually invent one to look complete; a model asked for a nullable field
 * has an explicit, legitimate way to say "I do not reliably know this". Every
 * reference, grading source, Arabic text and attribution below is nullable for
 * exactly that reason, and the prompts say plainly that null is the correct
 * answer when unsure.
 *
 * Second, **grading is an enum including `unknown`**. There is no way to return
 * a hadith without saying something about its authenticity, and no way to imply
 * authenticity by leaving the field out.
 */

const sourceCategory = z.enum(SOURCE_CATEGORIES);
const hadithGrading = z.enum(HADITH_GRADINGS);

export const quranEvidenceSchema = z.object({
  surah: z.string().min(1),
  surah_number: z.number().int().min(1).max(114).nullable().default(null),
  /** A string, because a citation is often a range: "255", "1-5". */
  ayah_number: z.string().nullable().default(null),
  /** Only when known verbatim and reliably. Null is expected and correct. */
  arabic: z.string().nullable().default(null),
  translation: z.string().nullable().default(null),
  translation_source: z.string().nullable().default(null),
  reference: z.string().nullable().default(null),
  relevance: z.string().min(3),
});

export const hadithEvidenceSchema = z.object({
  collection: z.string().min(1),
  reference: z.string().nullable().default(null),
  narrator: z.string().nullable().default(null),
  text: z.string().min(3),
  arabic: z.string().nullable().default(null),
  grading: hadithGrading,
  grading_source: z.string().nullable().default(null),
  relevance: z.string().min(3),
});

export const scholarlyPointSchema = z.object({
  position: z.string().min(3),
  attributed_to: z.string().nullable().default(null),
  category: sourceCategory,
  reference: z.string().nullable().default(null),
  note: z.string().default(''),
});

export const sensitiveClaimSchema = z.object({
  claim: z.string().min(3),
  why_sensitive: z.string().min(3),
  recommendation: z.string().min(3),
});

export const islamicSourceRefSchema = z.object({
  label: z.string().min(1),
  category: sourceCategory,
  reference: z.string().nullable().default(null),
  note: z.string().default(''),
});

export const islamicResearchResponseSchema = z.object({
  topic: z.string().min(2),
  summary: z.string().min(40),
  audience: z.string().min(3),
  content_goal: z.string().min(3),
  quran_evidence: z.array(quranEvidenceSchema).default([]),
  hadith_evidence: z.array(hadithEvidenceSchema).default([]),
  scholarly_context: z.array(scholarlyPointSchema).default([]),
  historical_context: z.array(z.string()).default([]),
  key_points: z.array(z.string()).min(1),
  areas_of_difference: z.array(z.string()).default([]),
  sensitive_claims: z.array(sensitiveClaimSchema).default([]),
  sources: z.array(islamicSourceRefSchema).default([]),
  /** The agent's own assessment of the package, not a guarantee. */
  self_assessment: z.string().default(''),
  notes: z.string().default(''),
});

export type IslamicResearchOutput = z.infer<typeof islamicResearchResponseSchema>;

/* ------------------------------------------------------------------ */
/* Content planning                                                    */
/* ------------------------------------------------------------------ */

export const islamicContentIdeaSchema = z.object({
  title: z.string().min(4).max(160),
  topic: z.string().min(2),
  summary: z.string().min(20),
  target_audience: z.string().min(3),
  content_goal: z.string().min(3),
  /** What kind of sourcing this idea will need before it can be scripted. */
  evidence_needed: z.array(sourceCategory).default([]),
  sensitivities: z.array(z.string()).default([]),
  why_it_might_work: z.string().min(10),
  estimated_minutes: z.number().min(1).max(90),
  confidence: z.number().min(0).max(1),
});

export const islamicContentPlanResponseSchema = z.object({
  theme: z.string().min(3),
  ideas: z.array(islamicContentIdeaSchema).min(1).max(25),
  notes: z.string().default(''),
});

export type IslamicContentPlanOutput = z.infer<typeof islamicContentPlanResponseSchema>;

/* ------------------------------------------------------------------ */
/* Source verification                                                 */
/* ------------------------------------------------------------------ */

export const sourceFindingSchema = z.object({
  claim: z.string().min(3),
  /** Where in the material this sits — a section name, a line, or null. */
  location: z.string().nullable().default(null),
  category: sourceCategory,
  status: z.enum(VERIFICATION_STATUSES),
  explanation: z.string().min(5),
  /** What it should say instead, when the checker can state that safely. */
  correction: z.string().nullable().default(null),
  /** What a human must do. Null when nothing is required. */
  required_action: z.string().nullable().default(null),
});

export const islamicSourceCheckResponseSchema = z.object({
  summary: z.string().min(20),
  findings: z.array(sourceFindingSchema).default([]),
  /** Items needing a human: missing references, unconfirmed attributions. */
  outstanding: z.array(z.string()).default([]),
  /** Where the material breaks the channel's own configured source policy. */
  policy_violations: z.array(z.string()).default([]),
});

export type IslamicSourceCheckOutput = z.infer<typeof islamicSourceCheckResponseSchema>;

/* ------------------------------------------------------------------ */
/* Script review                                                       */
/* ------------------------------------------------------------------ */

export const islamicScriptReviewResponseSchema = z.object({
  summary: z.string().min(20),
  findings: z.array(sourceFindingSchema).default([]),
  outstanding: z.array(z.string()).default([]),
  policy_violations: z.array(z.string()).default([]),
  /** Tone and framing notes that are not sourcing defects. */
  editorial_notes: z.array(z.string()).default([]),
});

export type IslamicScriptReviewOutput = z.infer<typeof islamicScriptReviewResponseSchema>;
