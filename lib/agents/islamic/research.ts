import { uuid } from '@/lib/ids';
import type { CapabilityHandler } from '@/lib/agents/capabilities';
import type { RunContext } from '@/lib/agents/context';
import { getSourcePolicy } from '@/lib/islamic/resolve';
import { disallowedHadith, renderSourcePolicy } from '@/lib/islamic/policy';
import {
  islamicContentPlanResponseSchema,
  islamicResearchResponseSchema,
} from '@/schemas/islamic';
import type { IslamicResearch } from '@/types/islamic';
import { baseIslamicContext, NO_FABRICATION } from './shared';

const now = () => new Date().toISOString();

/* ------------------------------------------------------------------ */
/* islamic.research                                                    */
/* ------------------------------------------------------------------ */

export const islamicResearch: CapabilityHandler<
  ReturnType<typeof islamicResearchResponseSchema.parse>
> = {
  capability: 'islamic.research',
  label: 'Islamic research package',
  schemaName: 'IslamicResearch',
  schema: islamicResearchResponseSchema,

  async buildPrompt(ctx) {
    const policy = ctx.task.business_id
      ? await getSourcePolicy(ctx.store, ctx.ownerId, ctx.task.business_id)
      : null;

    return [
      await baseIslamicContext(ctx),
      '',
      renderSourcePolicy(policy),
      '',
      'Prepare a research package for this topic.',
      '',
      NO_FABRICATION,
      '',
      'How to fill the fields:',
      "- `quran_evidence`: only verses you reliably know are relevant. Give surah and ayah. Include `arabic` ONLY if you know the wording verbatim and exactly — otherwise null. A near-miss on Qur'anic wording is worse than no Arabic at all.",
      '- `hadith_evidence`: give the collection and, where you know it, the reference. `grading` is required — use "unknown" when the grading is not established rather than assuming "sahih". Familiar-sounding is not the same as authentic.',
      '- `scholarly_context`: attribute positions only where you can name who holds them. Where you cannot, describe the position and set `attributed_to` to null.',
      '- `areas_of_difference`: where scholars genuinely differ, state the difference. Do not resolve it — this is educational material, not a ruling.',
      '- `sensitive_claims`: anything easily misunderstood, contested, or likely to be quoted out of context, with what you would do about it.',
      '- `key_points`: what a viewer should actually come away with.',
      '- `self_assessment`: how well-sourced this package really is, in your own words. Be honest about the weak parts.',
      '',
      'Do not issue a fatwa, do not rule on what is permitted or obligatory, and do not assume a madhhab.',
    ]
      .filter((part) => part.trim().length > 0)
      .join('\n');
  },

  async persist(ctx, data) {
    const businessId = ctx.business?.id ?? ctx.task.business_id ?? '';
    const policy = businessId
      ? await getSourcePolicy(ctx.store, ctx.ownerId, businessId)
      : null;

    // Policy is applied to what came back, not merely requested in the prompt.
    const hadithProblems = disallowedHadith(data.hadith_evidence, policy);
    const missingQuranRefs = policy?.require_quran_reference
      ? data.quran_evidence.filter((v) => !v.ayah_number).length
      : 0;

    const id = uuid();
    const record: IslamicResearch = {
      id,
      business_id: businessId,
      channel_id: null,
      mission_id: ctx.task.mission_id,
      task_id: ctx.task.id,
      idea_id: typeof ctx.task.input.idea_id === 'string' ? ctx.task.input.idea_id : null,
      topic: data.topic,
      summary: data.summary,
      audience: data.audience,
      content_goal: data.content_goal,
      quran_evidence: data.quran_evidence,
      hadith_evidence: data.hadith_evidence,
      scholarly_context: data.scholarly_context,
      historical_context: data.historical_context,
      key_points: data.key_points,
      areas_of_difference: data.areas_of_difference,
      sensitive_claims: data.sensitive_claims,
      sources: data.sources,
      verification_status: 'unreviewed',
      notes: [data.notes, data.self_assessment].filter(Boolean).join('\n\n'),
      is_demo: false,
      created_at: now(),
    };
    await ctx.store.insert('islamic_research', record);

    const counts = [
      `${data.quran_evidence.length} Qur'an reference${data.quran_evidence.length === 1 ? '' : 's'}`,
      `${data.hadith_evidence.length} hadith`,
      `${data.areas_of_difference.length} area${data.areas_of_difference.length === 1 ? '' : 's'} of difference`,
    ].join(', ');

    const warnings = [
      ...hadithProblems,
      missingQuranRefs > 0
        ? `${missingQuranRefs} Qur'an citation(s) have no ayah reference, which this channel requires.`
        : '',
    ].filter(Boolean);

    return {
      summary: `researched "${data.topic}" — ${counts}`,
      output: {
        research_id: id,
        topic: data.topic,
        quran_count: data.quran_evidence.length,
        hadith_count: data.hadith_evidence.length,
        sensitive_count: data.sensitive_claims.length,
        // Carried forward so the source checker can see them without re-deriving.
        policy_warnings: warnings,
      },
    };
  },
};

/* ------------------------------------------------------------------ */
/* islamic.content_plan                                                */
/* ------------------------------------------------------------------ */

export const islamicContentPlan: CapabilityHandler<
  ReturnType<typeof islamicContentPlanResponseSchema.parse>
> = {
  capability: 'islamic.content_plan',
  label: 'Islamic content plan',
  schemaName: 'IslamicContentPlan',
  schema: islamicContentPlanResponseSchema,

  async buildPrompt(ctx) {
    const policy = ctx.task.business_id
      ? await getSourcePolicy(ctx.store, ctx.ownerId, ctx.task.business_id)
      : null;
    const count = requestedCount(ctx, 8);

    return [
      await baseIslamicContext(ctx),
      '',
      renderSourcePolicy(policy),
      '',
      `Propose ${count} content ideas.`,
      '',
      NO_FABRICATION,
      '',
      'For each idea:',
      '- `evidence_needed` says what kind of sourcing it will require before it can be scripted. Be realistic: an idea that needs evidence nobody can supply is not a good idea.',
      '- `sensitivities` names anything contested, easily misunderstood, or likely to attract disagreement. An empty list is fine when there genuinely is nothing.',
      '- `estimated_minutes` should suit the depth the topic actually needs.',
      '- `confidence` is your own, honestly held.',
      '',
      'Prefer topics that can be taught accurately from well-established sources over topics that sound compelling but rest on weak material. Do not propose anything that requires issuing a ruling.',
    ]
      .filter((part) => part.trim().length > 0)
      .join('\n');
  },

  async persist(ctx, data) {
    const businessId = ctx.business?.id ?? ctx.task.business_id ?? '';
    const timestamp = now();

    // Ideas land in the ordinary ideas table, so the existing Ideas screen,
    // approval flow and downstream pipeline work unchanged.
    const ideas = data.ideas.map((idea, index) => ({
      id: uuid(),
      business_id: businessId,
      channel_id: null,
      mission_id: ctx.task.mission_id,
      task_id: ctx.task.id,
      title: idea.title,
      topic: idea.topic,
      niche: data.theme,
      summary: idea.summary,
      target_audience: idea.target_audience,
      why_it_might_work: idea.why_it_might_work,
      competition: 'Not assessed — Islamic planning focuses on sourcing, not competition.',
      demand: 'Not assessed.',
      monetisation: 'Not assessed.',
      longevity: 'Evergreen educational content.',
      click_potential: idea.content_goal,
      difficulty:
        idea.evidence_needed.length > 0
          ? `Needs: ${idea.evidence_needed.join(', ')}`
          : 'No specific evidence identified.',
      score: Math.round(idea.confidence * 100),
      breakdown: {
        demand: 50,
        competition: 50,
        monetisation: 50,
        longevity: 80,
        click_potential: Math.round(idea.confidence * 100),
      },
      confidence: idea.confidence,
      sources: [],
      notes: idea.sensitivities.length > 0 ? `Sensitivities: ${idea.sensitivities.join('; ')}` : '',
      status: 'proposed' as const,
      is_demo: false,
      created_at: timestamp,
      updated_at: timestamp,
      // Deterministic ordering rather than relying on insertion order.
      position: index,
    }));

    await ctx.store.insertMany(
      'youtube_ideas',
      ideas.map(({ position: _position, ...idea }) => idea),
    );

    const sensitive = data.ideas.filter((idea) => idea.sensitivities.length > 0).length;

    return {
      summary: `planned ${data.ideas.length} ideas on "${data.theme}"${sensitive > 0 ? `, ${sensitive} with noted sensitivities` : ''}`,
      output: {
        idea_ids: ideas.map((idea) => idea.id),
        theme: data.theme,
        count: data.ideas.length,
        sensitive_count: sensitive,
      },
    };
  },
};

/** "Give me ten ideas" → 10, clamped to something an operator can actually read. */
function requestedCount(ctx: RunContext, fallback: number): number {
  const explicit = ctx.task.input.count;
  if (typeof explicit === 'number' && explicit >= 1 && explicit <= 25) {
    return Math.round(explicit);
  }
  const text = `${ctx.task.title} ${ctx.task.description}`;
  const match = text.match(/\b(\d{1,2})\b/);
  const value = match ? Number(match[1]) : fallback;
  return value >= 1 && value <= 25 ? value : fallback;
}
