import { uuid } from '@/lib/ids';
import type { CapabilityHandler } from '@/lib/agents/capabilities';
import type { RunContext } from '@/lib/agents/context';
import { buildDigest } from '@/lib/operations/digest';
import { dailyBriefingSchema, recommendationsSchema } from '@/schemas/manager-ops';

const now = () => new Date().toISOString();

/**
 * The instruction that keeps both of these honest.
 *
 * A briefing that invents a plausible event is worse than no briefing: the
 * operator would act on it. So the model is told what it has, told that
 * nothing else exists, and given schemas with nowhere to put a general
 * impression.
 */
const GROUNDING = [
  'Everything you know about this workspace is in the JSON below. It was read from the',
  'database moments ago.',
  '',
  'Rules, in order of importance:',
  '- Do not mention anything that is not in the JSON. If an event is not there, it did not',
  '  happen. Do not infer that a mission "probably" finished, or that a channel is "likely"',
  "  doing well — you cannot see anything you have not been shown.",
  '- Use the real names, titles and mission numbers exactly as they appear. Never invent one.',
  '- Numbers must match. Do not round a cost into a rounder figure or restate a count.',
  '- Where a value is null it is genuinely unknown, not zero. Say "not known" rather than',
  '  reporting nought.',
  '- Say less rather than padding. An empty list is a correct answer when nothing qualifies.',
].join('\n');

async function digestFor(ctx: RunContext): Promise<string> {
  const { digest } = await buildDigest(ctx.store, ctx.ownerId);
  return JSON.stringify(digest, null, 2).slice(0, 40_000);
}

/* ------------------------------------------------------------------ */
/* manager.briefing                                                    */
/* ------------------------------------------------------------------ */

export const managerBriefing: CapabilityHandler<
  ReturnType<typeof dailyBriefingSchema.parse>
> = {
  capability: 'manager.briefing',
  label: 'Daily briefing',
  schemaName: 'DailyBriefing',
  schema: dailyBriefingSchema,

  async buildPrompt(ctx) {
    return [
      'Write the operator their daily briefing.',
      '',
      GROUNDING,
      '',
      '```json',
      await digestFor(ctx),
      '```',
      '',
      'How to write it:',
      '- `summary` is two or three sentences, the first of which says whether the workforce is',
      '  working and whether anything is waiting on them. Write it the way a chief of staff would',
      '  say it out loud, not as a status dump.',
      '- `things_needing_attention` lists what genuinely needs the operator, drawn from the',
      '  needsYou array. Name the mission and say what the decision is.',
      '- `missions_at_risk` is for missions blocked, failed, or overdue against a real deadline.',
      '  Do not speculate that something might slip; only report what the state shows.',
      '- `recent_wins` comes from recentlyCompleted. If nothing completed, leave it empty rather',
      '  than reaching for something.',
      '- `cost_notes` should mention today’s spend only if it is worth mentioning.',
      '- `recommended_next_actions` are concrete, in the order you would do them.',
    ].join('\n');
  },

  async persist(ctx, data) {
    // Stored as a command message so it appears in Command Centre history
    // alongside everything else the Manager has said, rather than in a table
    // that only one screen reads.
    const message = await ctx.store.insert('command_messages', {
      id: uuid(),
      owner_id: ctx.ownerId,
      role: 'manager',
      content: data.summary,
      mission_id: ctx.task.mission_id,
      refs: { briefing: data as unknown as Record<string, unknown> },
      created_at: now(),
    });

    const counts = [
      data.things_needing_attention.length > 0
        ? `${data.things_needing_attention.length} needing you`
        : '',
      data.missions_at_risk.length > 0 ? `${data.missions_at_risk.length} at risk` : '',
      data.recent_wins.length > 0 ? `${data.recent_wins.length} win(s)` : '',
    ].filter(Boolean);

    return {
      summary: `wrote the daily briefing${counts.length > 0 ? ` — ${counts.join(', ')}` : ''}`,
      output: {
        message_id: message.id,
        briefing: data as unknown as Record<string, unknown>,
      },
    };
  },
};

/* ------------------------------------------------------------------ */
/* manager.recommendations                                             */
/* ------------------------------------------------------------------ */

export const managerRecommendations: CapabilityHandler<
  ReturnType<typeof recommendationsSchema.parse>
> = {
  capability: 'manager.recommendations',
  label: 'Recommend what to do next',
  schemaName: 'Recommendations',
  schema: recommendationsSchema,

  async buildPrompt(ctx) {
    return [
      'The operator has asked what they should do next. Give them a short ranked list.',
      '',
      GROUNDING,
      '',
      '```json',
      await digestFor(ctx),
      '```',
      '',
      'How to choose:',
      '- Every recommendation must trace to something in the JSON. If you cannot point at the',
      '  row it came from, do not make it.',
      '- Rank by what is actually holding things up: a mission that cannot move without a',
      '  decision outranks one that is progressing fine.',
      '- Prefer recommendations the operator can act on in a minute over vague projects.',
      '- Never write encouragement, motivation or general advice about running a business.',
      '  "Keep up the good work" and "consider posting more consistently" are both useless here.',
      '- `reason` says what in the state makes this necessary. `impact` says what changes.',
      '- If nothing genuinely needs doing, return an empty list and say so in `note`. That is a',
      '  good answer, not a failure.',
      '- At most six. Three good ones beat six padded ones.',
    ].join('\n');
  },

  async persist(ctx, data) {
    const message = await ctx.store.insert('command_messages', {
      id: uuid(),
      owner_id: ctx.ownerId,
      role: 'manager',
      content:
        data.recommendations.length > 0
          ? data.recommendations.map((item, index) => `${index + 1}. ${item.title} — ${item.reason}`).join('\n')
          : data.note || 'Nothing needs your attention right now.',
      mission_id: ctx.task.mission_id,
      refs: { recommendations: data as unknown as Record<string, unknown> },
      created_at: now(),
    });

    return {
      summary:
        data.recommendations.length > 0
          ? `recommended ${data.recommendations.length} next action${data.recommendations.length === 1 ? '' : 's'}`
          : 'found nothing that needs doing right now',
      output: {
        message_id: message.id,
        recommendations: data as unknown as Record<string, unknown>,
        count: data.recommendations.length,
      },
    };
  },
};

export const OPERATIONS_HANDLERS: CapabilityHandler<never>[] = [
  managerBriefing,
  managerRecommendations,
] as unknown as CapabilityHandler<never>[];
