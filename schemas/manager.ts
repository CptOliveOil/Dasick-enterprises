import { z } from 'zod';

/**
 * The Commander's plan. Steps reference capabilities rather than agent ids so
 * the plan stays valid when the workforce changes.
 */
export const managerPlanSchema = z.object({
  /** Business slug the instruction belongs to, or null when it is global. */
  business: z.string().nullable().default(null),
  /** Short mission title, e.g. "Produce YouTube Video #009". */
  mission_title: z.string().min(4).max(120),
  /** What success looks like, in one or two sentences. */
  objective: z.string().min(10),
  /** Existing workflow definition key, when one fits. */
  workflow: z.string().nullable().default(null),
  /** Reply shown in the Command Centre chat. */
  reply: z.string().min(10),
  /**
   * How many independent missions to create from this plan. "Make 3 videos" is
   * three separate productions, each with its own cost, approvals and assets —
   * never one oversized mission.
   */
  repeat: z.number().int().min(1).max(10).default(1),
  steps: z
    .array(
      z.object({
        capability: z.string().min(2),
        title: z.string().min(3),
        description: z.string().default(''),
        /** Indices of earlier steps in this array that must finish first. */
        depends_on: z.array(z.number().int().nonnegative()).default([]),
        requires_approval: z.boolean().default(false),
        input: z.record(z.unknown()).default({}),
      }),
    )
    .min(1)
    .max(12),
});

export type ManagerPlan = z.infer<typeof managerPlanSchema>;
