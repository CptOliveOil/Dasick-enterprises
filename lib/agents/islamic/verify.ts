import { uuid } from '@/lib/ids';
import type { CapabilityHandler } from '@/lib/agents/capabilities';
import type { RunContext } from '@/lib/agents/context';
import { getSourcePolicy } from '@/lib/islamic/resolve';
import { renderSourcePolicy } from '@/lib/islamic/policy';
import {
  islamicScriptReviewResponseSchema,
  islamicSourceCheckResponseSchema,
} from '@/schemas/islamic';
import {
  isBlocking,
  needsResolution,
  scriptCarriesDifferenceContext,
  VERIFICATION_LABELS,
  type IslamicResearch,
  type IslamicSourceCheck,
  type SourceFinding,
  type SourceResolutionRecord,
} from '@/types/islamic';
import { baseIslamicContext, NO_FABRICATION } from './shared';

const now = () => new Date().toISOString();

const STATUS_GUIDE = [
  'Give every finding exactly one status:',
  '- VERIFIED: the citation and the claim both hold up.',
  '- ACCEPTABLE_WITH_CONTEXT: not wrong, but it will mislead unless something is added.',
  '- DIFFERENCE_OF_OPINION: scholars genuinely differ. This is a labelling requirement, not an error.',
  '- NEEDS_SOURCE: plausible, but nothing reliable is cited. A human must supply or confirm the reference.',
  '- QUESTIONABLE: you actively doubt this. Say why.',
  '- INCORRECT: this is wrong — a misquoted verse, a misattributed hadith, a wrong grading, a position attributed to someone who did not hold it.',
  '',
  'QUESTIONABLE and INCORRECT stop the content and require a person. Use them when they are',
  'warranted and do not soften them; that is what they are for. Equally, do not reach for',
  'them where NEEDS_SOURCE is the honest answer.',
].join('\n');

/* ------------------------------------------------------------------ */
/* islamic.source_verify                                               */
/* ------------------------------------------------------------------ */

export const islamicSourceVerify: CapabilityHandler<
  ReturnType<typeof islamicSourceCheckResponseSchema.parse>
> = {
  capability: 'islamic.source_verify',
  label: 'Verify Islamic sources',
  schemaName: 'IslamicSourceCheck',
  schema: islamicSourceCheckResponseSchema,

  async buildPrompt(ctx) {
    const research = await resolveResearch(ctx);
    const policy = ctx.task.business_id
      ? await getSourcePolicy(ctx.store, ctx.ownerId, ctx.task.business_id)
      : null;

    return [
      await baseIslamicContext(ctx),
      '',
      renderSourcePolicy(policy),
      '',
      'Review the research package below for source accuracy.',
      '',
      '```json',
      JSON.stringify(researchForReview(research), null, 2).slice(0, 24_000),
      '```',
      '',
      NO_FABRICATION,
      '',
      STATUS_GUIDE,
      '',
      'Check specifically:',
      "- Qur'an citations: does the surah and ayah given actually correspond to what is quoted?",
      '- Hadith: is the collection right, is the reference plausible, and is the grading defensible? A hadith presented as sahih that is not is an INCORRECT finding, not a note.',
      '- Arabic quotations: if Arabic is present and you cannot confirm it verbatim, that is QUESTIONABLE at minimum.',
      '- Attributed positions: did the named scholar actually hold this?',
      '- Anything presented as settled that is in fact disputed.',
      '',
      '`policy_violations` is for places the material breaks the channel policy above — for example an unlabelled weak hadith where the channel requires labelling.',
      '',
      'Do not repair a citation from memory. Say what is wrong and what a human must check.',
    ]
      .filter((part) => part.trim().length > 0)
      .join('\n');
  },

  async persist(ctx, data) {
    const research = await resolveResearch(ctx);
    return persistCheck(ctx, {
      subject: 'research',
      researchId: research?.id ?? null,
      scriptId: null,
      summary: data.summary,
      findings: data.findings,
      outstanding: data.outstanding,
      policyViolations: data.policy_violations,
    });
  },
};

/* ------------------------------------------------------------------ */
/* islamic.script_review                                               */
/* ------------------------------------------------------------------ */

export const islamicScriptReview: CapabilityHandler<
  ReturnType<typeof islamicScriptReviewResponseSchema.parse>
> = {
  capability: 'islamic.script_review',
  label: 'Islamic script review',
  schemaName: 'IslamicScriptReview',
  schema: islamicScriptReviewResponseSchema,

  async buildPrompt(ctx) {
    const scriptId = resolveScriptId(ctx);
    const script = scriptId ? await ctx.store.get('youtube_scripts', scriptId) : null;
    const research = await resolveResearch(ctx);
    const policy = ctx.task.business_id
      ? await getSourcePolicy(ctx.store, ctx.ownerId, ctx.task.business_id)
      : null;

    const body = script
      ? script.sections.map((section) => `## ${section.heading}\n${section.body}`).join('\n\n')
      : '(script unavailable)';

    return [
      await baseIslamicContext(ctx),
      '',
      renderSourcePolicy(policy),
      '',
      'Review this script for Islamic accuracy before it goes into production.',
      '',
      '```',
      body.slice(0, 24_000),
      '```',
      research
        ? `\nThe researched package this script was written from:\n\n\`\`\`json\n${JSON.stringify(researchForReview(research), null, 2).slice(0, 12_000)}\n\`\`\``
        : '',
      '',
      NO_FABRICATION,
      '',
      STATUS_GUIDE,
      '',
      'Check every religious claim in the narration: quoted verses, hadith and their gradings,',
      'Arabic wording, attributed positions, and anything stated as settled that is disputed.',
      'Use `location` to say where in the script the finding sits so the writer can find it.',
      '',
      '`editorial_notes` is for tone and framing — over-claiming, an unclear caveat, a phrasing',
      'likely to be quoted out of context. Those are notes, not sourcing defects, and do not',
      'block on their own.',
    ]
      .filter((part) => part.trim().length > 0)
      .join('\n');
  },

  async persist(ctx, data) {
    const scriptId = resolveScriptId(ctx);
    const research = await resolveResearch(ctx);
    return persistCheck(ctx, {
      subject: 'script',
      researchId: research?.id ?? null,
      scriptId,
      summary: data.summary,
      findings: data.findings,
      outstanding: [...data.outstanding, ...data.editorial_notes.map((n) => `Editorial: ${n}`)],
      policyViolations: data.policy_violations,
    });
  },
};

/* ------------------------------------------------------------------ */
/* Shared persistence                                                  */
/* ------------------------------------------------------------------ */

/**
 * Records a check and decides whether the pipeline may continue.
 *
 * The verdict is computed from the findings, not taken from the model: a model
 * that says "looks good" while returning an INCORRECT finding must not be able
 * to wave itself through. `blocked` on the result is what the workflow engine
 * reads, so a blocked check genuinely stops the mission — it is not a label.
 */
async function persistCheck(
  ctx: RunContext,
  input: {
    subject: 'research' | 'script';
    researchId: string | null;
    scriptId: string | null;
    summary: string;
    findings: SourceFinding[];
    outstanding: string[];
    policyViolations: string[];
  },
) {
  const businessId = ctx.business?.id ?? ctx.task.business_id ?? '';
  const blockingFindings = input.findings.filter((finding) => isBlocking(finding.status));
  const needsSource = input.findings.filter((finding) => needsResolution(finding.status));
  const differences = input.findings.filter(
    (finding) => finding.status === 'DIFFERENCE_OF_OPINION',
  );

  // A difference of opinion may pass only when the script actually tells the
  // audience there is one. The checker noticing is not the audience being told,
  // so where the context is missing it becomes something to resolve rather than
  // a note that quietly disappears.
  const unlabelledDifferences = await missingDifferenceContext(ctx, input.scriptId, differences);

  const verdict: IslamicSourceCheck['verdict'] =
    blockingFindings.length > 0
      ? 'blocked'
      : needsSource.length > 0 || unlabelledDifferences.length > 0 || input.policyViolations.length > 0
        ? 'pass_with_notes'
        : 'pass';

  const id = uuid();
  const record: IslamicSourceCheck = {
    id,
    business_id: businessId,
    research_id: input.researchId,
    script_id: input.scriptId,
    video_id: typeof ctx.task.input.video_id === 'string' ? ctx.task.input.video_id : null,
    mission_id: ctx.task.mission_id,
    task_id: ctx.task.id,
    subject: input.subject,
    verdict,
    summary: input.summary,
    findings: input.findings,
    outstanding: input.outstanding,
    policy_violations: input.policyViolations,
    is_demo: false,
    created_at: now(),
  };
  await ctx.store.insert('islamic_source_checks', record);

  if (input.researchId) {
    await ctx.store.update('islamic_research', input.researchId, {
      verification_status: verdict === 'blocked' ? 'blocked' : 'reviewed',
    });
  }

  const output = {
    source_check_id: id,
    verdict,
    subject: input.subject,
    research_id: input.researchId,
    script_id: input.scriptId,
    findings: input.findings.length,
    blocking: blockingFindings.length,
    needs_source: needsSource.length,
    differences: differences.length,
    policy_violations: input.policyViolations.length,
  };

  if (verdict === 'blocked') {
    const detail = blockingFindings
      .slice(0, 3)
      .map((finding) => `${VERIFICATION_LABELS[finding.status]}: ${finding.claim}`)
      .join('; ');
    return {
      summary: `blocked the ${input.subject} — ${blockingFindings.length} source ${blockingFindings.length === 1 ? 'problem' : 'problems'}`,
      output,
      // A religious-source error never progresses on its own.
      blocked:
        `${blockingFindings.length} religious source ${blockingFindings.length === 1 ? 'problem' : 'problems'} must be resolved before this can continue. ${detail}`.slice(
          0,
          600,
        ),
    };
  }

  const notes = [
    needsSource.length > 0 ? `${needsSource.length} claim(s) need a source` : '',
    unlabelledDifferences.length > 0
      ? `${unlabelledDifferences.length} difference(s) of opinion not labelled in the script`
      : '',
    input.policyViolations.length > 0
      ? `${input.policyViolations.length} channel-policy issue(s)`
      : '',
  ].filter(Boolean);

  // NEEDS_SOURCE is an unfinished job, not a defect. It pauses the mission at a
  // resolution gate the operator can actually act on — add a source, ask for a
  // re-check, edit or remove the claim, or override deliberately — rather than
  // failing the task or, worse, sliding past unnoticed.
  const pending = [...needsSource, ...unlabelledDifferences];
  if (pending.length > 0) {
    const resolution = await openResolution(ctx, {
      businessId,
      sourceCheckId: id,
      scriptId: input.scriptId,
      findings: pending,
    });

    return {
      summary: `checked ${input.findings.length} claim${input.findings.length === 1 ? '' : 's'} — ${pending.length} need${pending.length === 1 ? 's' : ''} a source before this can continue`,
      output: { ...output, notes, resolution_id: resolution.id, unresolved: pending.length },
      approval: {
        kind: 'source' as const,
        title: `Source required: ${pending.length} claim${pending.length === 1 ? '' : 's'}`,
        summary:
          `${pending.length} religious claim${pending.length === 1 ? '' : 's'} could not be verified. ` +
          `Add a reference, ask the Source Checker to research it, edit or remove the claim, or override deliberately. ` +
          `Nothing continues until each one is settled.`,
        payload: {
          resolution_id: resolution.id,
          source_check_id: id,
          script_id: input.scriptId,
          research_id: input.researchId,
          video_id: record.video_id,
          claims: pending.length,
          items: resolution.items.map((item) => ({
            id: item.id,
            claim: item.claim,
            reason: item.reason,
            current_source: item.current_source,
            location: item.location,
            category: item.category,
          })),
        },
      },
    };
  }

  return {
    summary: `checked ${input.findings.length} religious claim${input.findings.length === 1 ? '' : 's'}${notes.length > 0 ? ` — ${notes.join(', ')}` : ' — all supported'}`,
    output: { ...output, notes },
  };
}

/**
 * Records the claims awaiting a decision.
 *
 * Kept as its own row rather than living in the approval payload, because the
 * outcome has to outlive the approval: the final QC report needs to say which
 * claims were overridden, months later, when the approval is long resolved.
 */
async function openResolution(
  ctx: RunContext,
  input: {
    businessId: string;
    sourceCheckId: string;
    scriptId: string | null;
    findings: SourceFinding[];
  },
): Promise<SourceResolutionRecord> {
  const timestamp = now();
  const record: SourceResolutionRecord = {
    id: uuid(),
    owner_id: ctx.ownerId,
    business_id: input.businessId,
    source_check_id: input.sourceCheckId,
    script_id: input.scriptId,
    video_id: typeof ctx.task.input.video_id === 'string' ? ctx.task.input.video_id : null,
    mission_id: ctx.task.mission_id,
    task_id: ctx.task.id,
    approval_id: null,
    items: input.findings.map((finding) => ({
      id: uuid(),
      claim: finding.claim,
      reason: finding.explanation,
      current_source: finding.correction,
      location: finding.location,
      category: finding.category,
      status: 'unresolved' as const,
      action: null,
      resolved_source: null,
      edited_claim: null,
      override_reason: null,
      resolved_by: null,
      resolved_at: null,
    })),
    status: 'open',
    is_demo: false,
    created_at: timestamp,
    updated_at: timestamp,
  };
  await ctx.store.insert('source_resolutions', record);
  return record;
}

/**
 * Differences of opinion whose context is missing from the script.
 *
 * When there is no script yet — a research-stage check — there is nothing to
 * inspect, so nothing is flagged: the labelling requirement applies to what the
 * audience hears, and the script review step checks it again once one exists.
 */
async function missingDifferenceContext(
  ctx: RunContext,
  scriptId: string | null,
  differences: SourceFinding[],
): Promise<SourceFinding[]> {
  if (differences.length === 0 || !scriptId) return [];

  const businessId = ctx.business?.id ?? ctx.task.business_id;
  if (businessId) {
    const policy = await getSourcePolicy(ctx.store, ctx.ownerId, businessId);
    if (!policy.require_difference_labelling) return [];
  }

  const script = await ctx.store.get('youtube_scripts', scriptId);
  if (!script) return [];
  const body = script.sections.map((section) => `${section.heading} ${section.body}`).join('\n');
  return scriptCarriesDifferenceContext(body) ? [] : differences;
}

/* ------------------------------------------------------------------ */
/* Resolution                                                          */
/* ------------------------------------------------------------------ */

/** Trims the stored record to what a reviewer needs, and drops bookkeeping. */
function researchForReview(research: IslamicResearch | null) {
  if (!research) return { note: 'No research package was found for this task.' };
  const {
    id: _id,
    business_id: _business,
    mission_id: _mission,
    task_id: _task,
    idea_id: _idea,
    channel_id: _channel,
    is_demo: _demo,
    created_at: _created,
    ...rest
  } = research;
  return rest;
}

async function resolveResearch(ctx: RunContext): Promise<IslamicResearch | null> {
  const direct = ctx.task.input.research_id;
  if (typeof direct === 'string') {
    return await ctx.store.get('islamic_research', direct);
  }
  for (const output of Object.values(ctx.previousOutputs)) {
    if (typeof output.research_id === 'string') {
      const found = await ctx.store.get('islamic_research', output.research_id);
      if (found) return found;
    }
  }
  // Fall back to the most recent package for this mission, which is what the
  // operator means when they re-run a check by hand.
  if (ctx.task.mission_id) {
    const rows = await ctx.store.list('islamic_research', {
      where: { mission_id: ctx.task.mission_id },
    });
    if (rows.length > 0) {
      return rows.reduce((latest, row) =>
        row.created_at > latest.created_at ? row : latest,
      );
    }
  }
  return null;
}

function resolveScriptId(ctx: RunContext): string | null {
  const direct = ctx.task.input.script_id;
  if (typeof direct === 'string') return direct;
  for (const output of Object.values(ctx.previousOutputs)) {
    if (typeof output.script_id === 'string') return output.script_id;
  }
  return null;
}
