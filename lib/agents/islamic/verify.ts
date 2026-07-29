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
  VERIFICATION_LABELS,
  type IslamicResearch,
  type IslamicSourceCheck,
  type SourceFinding,
  type VerificationStatus,
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
  const needsSource = input.findings.filter((finding) => finding.status === 'NEEDS_SOURCE');
  const differences = input.findings.filter(
    (finding) => finding.status === 'DIFFERENCE_OF_OPINION',
  );

  const verdict: IslamicSourceCheck['verdict'] =
    blockingFindings.length > 0
      ? 'blocked'
      : needsSource.length > 0 || input.policyViolations.length > 0
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
    differences.length > 0 ? `${differences.length} difference(s) of opinion to label` : '',
    input.policyViolations.length > 0
      ? `${input.policyViolations.length} channel-policy issue(s)`
      : '',
  ].filter(Boolean);

  return {
    summary: `checked ${input.findings.length} religious claim${input.findings.length === 1 ? '' : 's'}${notes.length > 0 ? ` — ${notes.join(', ')}` : ' — all supported'}`,
    output: { ...output, notes },
  };
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
