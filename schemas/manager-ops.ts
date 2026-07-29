import { z } from 'zod';

/**
 * The daily briefing.
 *
 * Every field is a *reading* of state that was handed to the model, never a
 * recollection. The prompt says plainly that anything not in the digest did not
 * happen, and the schema gives no field in which to record a general
 * observation — there is nowhere to put "things are going well", which is the
 * point.
 */
export const dailyBriefingSchema = z.object({
  /** Two or three sentences. What is true right now. */
  summary: z.string().min(30).max(1200),
  important_updates: z.array(z.string()).default([]),
  things_needing_attention: z.array(z.string()).default([]),
  missions_at_risk: z
    .array(
      z.object({
        mission: z.string().min(1),
        why: z.string().min(5),
      }),
    )
    .default([]),
  recent_wins: z.array(z.string()).default([]),
  cost_notes: z.array(z.string()).default([]),
  recommended_next_actions: z.array(z.string()).default([]),
});

export type DailyBriefing = z.infer<typeof dailyBriefingSchema>;

export const URGENCY = ['critical', 'high', 'normal', 'low'] as const;

export const recommendationSchema = z.object({
  title: z.string().min(4).max(140),
  /** Why, in terms of the state given. */
  reason: z.string().min(10).max(600),
  /** What changes if this is done. */
  impact: z.string().min(5).max(400),
  urgency: z.enum(URGENCY),
  related_business: z.string().nullable().default(null),
  /** Mission number as written in the digest, e.g. "12". Null when general. */
  related_mission: z.string().nullable().default(null),
  /** One concrete thing to do. */
  suggested_action: z.string().min(5).max(300),
});

export const recommendationsSchema = z.object({
  recommendations: z.array(recommendationSchema).max(6).default([]),
  /** Said when there is genuinely nothing worth recommending. */
  note: z.string().default(''),
});

export type Recommendation = z.infer<typeof recommendationSchema>;
export type Recommendations = z.infer<typeof recommendationsSchema>;
