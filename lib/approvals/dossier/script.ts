import 'server-only';
import { buildScenes, sceneLabel } from '@/lib/approvals/scenes';
import { diffWords } from '@/lib/approvals/diff';
import { groupSources, type SourceCitation } from '@/lib/approvals/sources';
import { scoreScript } from '@/lib/approvals/quality';
import { priorTopics } from '@/lib/memory/business';
import type { DataStore } from '@/lib/db/tables';
import type {
  FactCheckFinding,
  ScriptSection,
  YoutubeFactCheck,
  YoutubeResearch,
  YoutubeScript,
  YoutubeScriptVersion,
} from '@/types/domain';
import type { DossierBuilder } from './registry';
import type {
  Claim,
  DocumentBlock,
  DossierPart,
  Metric,
  SectionDiff,
  Tone,
} from './types';

/**
 * The editorial review for a written script.
 *
 * This is the builder that the whole framework was extracted for. The old
 * script approval showed a fact-check receipt — "1 claim checked, 1 warning" —
 * and asked for a decision that starts production and opens a budget. Nobody
 * can make that decision from a count.
 *
 * So everything the operator needs is assembled here and nowhere else: the
 * script itself in full, every claim with the reason behind its verdict, every
 * source grouped by what kind of evidence it is, measured quality scores that
 * state what they measured, the storyboard the narration implies, and the
 * version history with a word-level diff against the previous draft.
 *
 * It reads. It does not call a provider, does not regenerate, and does not
 * write — reviewing a decision must never cost money or change the thing being
 * reviewed. The one exception is Business Intelligence Memory, which is read to
 * judge originality against work this business has already published.
 */
export const scriptDossier: DossierBuilder = {
  id: 'script',
  kinds: ['script'],

  async build({ store, approval }): Promise<DossierPart | null> {
    const payload = (approval.payload ?? {}) as Record<string, unknown>;
    const scriptId = typeof payload.script_id === 'string' ? payload.script_id : null;
    if (!scriptId) return null;

    const script = await store.get('youtube_scripts', scriptId).catch(() => null);
    // No row means the script was deleted after the approval was raised. The
    // generic builder still renders the payload snapshot, which is a worse
    // review than this one and a much better one than nothing.
    if (!script) return null;

    const [versions, factChecks, research, metadata, cost] = await Promise.all([
      store
        .list('youtube_script_versions', {
          where: { script_id: script.id },
          orderBy: { column: 'version', ascending: false },
        })
        .catch(() => [] as YoutubeScriptVersion[]),
      store
        .list('youtube_fact_checks', { where: { script_id: script.id } })
        .catch(() => [] as YoutubeFactCheck[]),
      script.research_id
        ? store.get('youtube_research', script.research_id).catch(() => null)
        : Promise.resolve(null),
      metadataFor(store, script.id),
      productionCost(store, approval.mission_id),
    ]);

    const factCheck = latest(factChecks);
    const findings = factCheck?.findings ?? [];
    const citations = citationsFrom(script.sections, research, findings);
    const sourceGroups = groupSources(citations);
    const sourceCount = sourceGroups
      .flatMap((group) => group.sources)
      .filter((source) => source.publisher !== '—').length;

    const quality = scoreScript({
      title: script.title,
      sections: script.sections,
      wordCount: script.word_count,
      estimatedSeconds: script.estimated_duration_seconds,
      findings,
      research,
      metadata,
      priorTopics: await priorTopics(store, script.business_id),
    });

    const verified = findings.filter((finding) => finding.verdict === 'verified');
    const flagged = findings.filter((finding) => finding.verdict !== 'verified');
    const scenes = buildScenes(script.sections);

    return {
      summary: {
        title: script.title,
        subtitle: `${script.tone} · for ${script.audience} · ${script.goal}`,
        attribution: [{ label: 'Draft', value: `Version ${script.version}` }],
        metrics: summaryMetrics({
          script,
          findings,
          verified: verified.length,
          flagged: flagged.length,
          sourceCount,
          quality: quality.overall?.value ?? null,
          cost,
        }),
        notice: noticeFor(script, factCheck),
      },
      panels: [
        {
          kind: 'document',
          id: 'script',
          title: 'The script',
          subtitle: `${script.sections.length} sections, in order, exactly as written.`,
          words: script.word_count,
          seconds: script.estimated_duration_seconds,
          blocks: script.sections.map(toBlock),
        },
        {
          kind: 'claims',
          id: 'claims',
          title: 'Fact check',
          subtitle: factCheck?.summary ?? null,
          note: factCheck
            ? null
            : 'No fact check has been run against this draft. Nothing in the script has been checked against a source.',
          verified: verified.map((finding, index) =>
            toClaim(finding, index, script.sections),
          ),
          warnings: flagged.map((finding, index) =>
            toClaim(finding, index + verified.length, script.sections),
          ),
        },
        {
          kind: 'sources',
          id: 'sources',
          title: 'Sources',
          subtitle: `${sourceCount} distinct source${sourceCount === 1 ? '' : 's'} behind ${citations.length} claim${citations.length === 1 ? '' : 's'}.`,
          note: 'These are the citations the agents recorded. No link was opened or checked at review time — reliability describes what a publisher is, not whether this particular claim is right.',
          groups: sourceGroups,
        },
        {
          kind: 'scores',
          id: 'quality',
          title: 'Quality',
          subtitle: 'Measured from the text itself. Every score says what it measured.',
          note: 'Nothing here predicts what an audience will do. Where there is not enough to measure, the score is left unknown rather than guessed.',
          overall: quality.overall,
          scores: quality.scores,
        },
        {
          kind: 'scenes',
          id: 'scenes',
          title: 'Visual breakdown',
          subtitle: `${scenes.length} scene${scenes.length === 1 ? '' : 's'}, split where a cut could land.`,
          note: 'Suggestions drawn from the narration. No footage has been sourced, generated or reserved — a scene with nothing concrete to cut to is usually a note about the writing.',
          scenes,
          seconds: scenes.reduce((total, scene) => total + scene.seconds, 0),
        },
        {
          kind: 'versions',
          id: 'versions',
          title: 'Version history',
          subtitle:
            versions.length > 1
              ? `${versions.length} drafts. The diff shows what changed between each.`
              : 'This is the first draft. Requesting changes produces a version 2 you can compare against it.',
          versions: versions.map((version) => ({
            id: version.id,
            version: version.version,
            note: version.note,
            words: countWords(version.sections),
            created_at: version.created_at,
          })),
          diffs: buildDiffs(versions),
          history: [
            {
              at: approval.created_at,
              decision: 'Sent for review',
              tone: 'neutral' as Tone,
              feedback: null,
            },
            ...(approval.resolved_at
              ? [
                  {
                    at: approval.resolved_at,
                    decision:
                      approval.status === 'approved'
                        ? 'Approved'
                        : approval.status === 'rejected'
                          ? 'Rejected'
                          : 'Changes requested',
                    tone: (approval.status === 'approved'
                      ? 'emerald'
                      : approval.status === 'rejected'
                        ? 'red'
                        : 'amber') as Tone,
                    feedback: approval.feedback,
                  },
                ]
              : []),
          ],
        },
      ],
      document: { title: script.title, markdown: toMarkdown(script) },
      href: `/youtube/scripts/${script.id}`,
      approveConsequence:
        'Production begins: narration, visuals and rendering all start, and they spend real money. The script is frozen at this version.',
      source: 'records',
    };
  },
};

/* ------------------------------------------------------------------ */
/* Summary                                                             */
/* ------------------------------------------------------------------ */

/** People read roughly 230 words a minute; narration runs slower. */
const READING_WPM = 230;

function summaryMetrics(input: {
  script: YoutubeScript;
  findings: FactCheckFinding[];
  verified: number;
  flagged: number;
  sourceCount: number;
  quality: number | null;
  cost: { amount: number; seconds: number | null };
}): Metric[] {
  const { script, findings, verified, flagged, sourceCount, quality, cost } = input;

  return [
    {
      label: 'Runtime',
      value: formatDuration(script.estimated_duration_seconds),
      hint: 'Estimated from the word count at narration pace.',
    },
    {
      label: 'Word count',
      value: script.word_count.toLocaleString('en-GB'),
    },
    {
      label: 'Reading time',
      value: formatDuration((script.word_count / READING_WPM) * 60),
      hint: 'How long it takes you to read it, faster than it will be narrated.',
    },
    {
      label: 'Sources',
      value: String(sourceCount),
      tone: sourceCount === 0 ? 'red' : sourceCount < 3 ? 'amber' : 'emerald',
      hint: 'Distinct publishers behind the research and the fact check.',
    },
    {
      label: 'Verified claims',
      value: `${verified} of ${findings.length}`,
      tone: findings.length === 0 ? 'amber' : verified === findings.length ? 'emerald' : 'neutral',
    },
    {
      label: 'Needs manual review',
      value: String(flagged),
      tone: flagged === 0 ? 'emerald' : 'amber',
      hint: flagged > 0 ? 'Read every one before approving.' : undefined,
    },
    {
      label: 'Confidence',
      value: quality === null ? 'Not measurable' : `${quality}/100`,
      tone: quality === null ? 'neutral' : quality >= 75 ? 'emerald' : quality >= 50 ? 'amber' : 'red',
      hint: 'The mean of the measured quality scores below.',
    },
    {
      label: 'AI cost',
      value: `£${cost.amount.toFixed(2)}`,
      hint: 'Already spent producing this draft. Approving does not refund it.',
    },
    {
      label: 'Generation time',
      value: cost.seconds === null ? 'Not recorded' : formatDuration(cost.seconds),
      hint: 'Model time across every step of this mission.',
    },
    {
      label: 'Last edited',
      value: new Date(script.updated_at).toLocaleString('en-GB', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    },
  ];
}

export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  if (total < 60) return `${total}s`;
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return rest === 0 ? `${minutes}m` : `${minutes}m ${rest}s`;
}

function noticeFor(script: YoutubeScript, factCheck: YoutubeFactCheck | null): string | null {
  if (script.is_demo) {
    return 'This script is demo data. It was not written by a real model and must not be produced.';
  }
  if (!factCheck) {
    return 'Nothing in this script has been fact checked. Every claim below is unverified.';
  }
  if (!factCheck.passed) {
    return 'The fact check did not pass. At least one claim is marked possibly incorrect — read the warnings before deciding.';
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Document                                                            */
/* ------------------------------------------------------------------ */

const SECTION_TONE: Partial<Record<ScriptSection['kind'], Tone>> = {
  hook: 'amber',
  payoff: 'emerald',
  cta: 'sky',
  pattern_interrupt: 'sky',
  transition: 'neutral',
};

/** Narration pace, matching the storyboard. */
const NARRATION_WPM = 155;

function toBlock(section: ScriptSection, index: number): DocumentBlock {
  const words = countWordsIn(section.body);
  return {
    id: `section-${index}`,
    label: sceneLabel(section.kind),
    heading: section.heading,
    body: section.body,
    words,
    seconds: Math.round((words / NARRATION_WPM) * 60),
    tone: SECTION_TONE[section.kind],
  };
}

function toMarkdown(script: YoutubeScript): string {
  const lines = [
    `# ${script.title}`,
    '',
    `${script.word_count.toLocaleString('en-GB')} words · ~${formatDuration(script.estimated_duration_seconds)} · ${script.tone} · for ${script.audience}`,
    '',
  ];
  for (const section of script.sections) {
    lines.push(`## ${sceneLabel(section.kind)} — ${section.heading}`, '', section.body.trim(), '');
  }
  return lines.join('\n');
}

const countWordsIn = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;
const countWords = (sections: ScriptSection[]) =>
  sections.reduce((total, section) => total + countWordsIn(section.body), 0);

/* ------------------------------------------------------------------ */
/* Claims                                                             */
/* ------------------------------------------------------------------ */

const VERDICT_LABEL: Record<FactCheckFinding['verdict'], string> = {
  verified: 'Verified',
  needs_review: 'Needs manual review',
  potentially_incorrect: 'Possibly incorrect',
  unsourced: 'Unverified — no source',
};

const VERDICT_TONE: Record<FactCheckFinding['verdict'], Tone> = {
  verified: 'emerald',
  needs_review: 'amber',
  potentially_incorrect: 'red',
  unsourced: 'amber',
};

/**
 * The kind of concern a finding raises.
 *
 * A verdict says whether a claim stands up; a category says what kind of
 * trouble it is. "Needs review" on a dosage is a different decision from
 * "needs review" on a release date, and an operator scanning twenty findings
 * needs to see which is which without reading all twenty.
 *
 * Matched in order of seriousness, so a medical claim that also mentions a
 * brand is categorised as medical.
 */
const CATEGORIES: { name: string; pattern: RegExp }[] = [
  {
    name: 'Medical claim',
    pattern: /\b(health|medical|disease|symptom|treatment|cure|diagnos|drug|dosage|mg\b|therapy|vaccine|toxic|poison)/i,
  },
  {
    name: 'Legal claim',
    pattern: /\b(legal|lawsuit|liable|illegal|unlawful|regulation|statute|court|sued|patent|licence|license)/i,
  },
  {
    name: 'Copyright concern',
    pattern: /\b(copyright|trademark|intellectual property|\bip\b|likeness|logo|brand|owned by|permission)/i,
  },
  {
    name: 'Possible bias',
    pattern: /\b(allegedly|critics|controversial|some say|arguably|widely believed|opinion|claims that|reportedly|fans believe)/i,
  },
  {
    name: 'Historical uncertainty',
    pattern: /\b(historian|disputed|contemporary account|no record|first recorded|legend|apocryphal|conflicting|contested)/i,
  },
  {
    name: 'Weak evidence',
    pattern: /\b(single source|one source|unclear|could not (?:find|verify)|no source|unsourced|anecdotal|forum|wiki)/i,
  },
];

export function categoriseFinding(finding: FactCheckFinding): string {
  const haystack = `${finding.claim} ${finding.reasoning}`;
  const found = CATEGORIES.find((entry) => entry.pattern.test(haystack));
  if (found) return found.name;
  return finding.verdict === 'verified' ? 'Verified fact' : 'Needs manual review';
}

/**
 * A source named inside the reasoning, when the fact checker cited one there.
 *
 * The schema has no source field on a finding, so the only honest place to look
 * is the prose. Nothing is invented when there is nothing to find — the claim
 * is shown with no source, which is itself the finding.
 */
function sourceInReasoning(reasoning: string): string | null {
  const url = reasoning.match(/https?:\/\/\S+/)?.[0];
  if (url) return url.replace(/[.,;)]+$/, '');
  const named = reasoning.match(
    /\b(?:according to|per|cited (?:in|by)|source[:d]?)\s+([A-Z][\w.&' -]{2,60})/,
  )?.[1];
  return named?.trim() ?? null;
}

function toClaim(finding: FactCheckFinding, index: number, sections: ScriptSection[]): Claim {
  return {
    id: `claim-${index}`,
    claim: finding.claim,
    status: VERDICT_LABEL[finding.verdict],
    tone: VERDICT_TONE[finding.verdict],
    // The reasoning is why. Never blank: a warning with no explanation cannot
    // be acted on, so the fallback names the gap instead of leaving it empty.
    why:
      finding.reasoning.trim() ||
      'The fact checker recorded no reasoning for this verdict, which is itself a reason to check it by hand.',
    category: categoriseFinding(finding),
    source: sourceInReasoning(finding.reasoning),
    confidence: null,
    correction: finding.suggested_correction,
    location: locate(finding.claim, sections),
  };
}

/** Which section a claim appears in, by looking for its distinctive words. */
export function locate(claim: string, sections: ScriptSection[]): string | null {
  const words = claim
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 4);
  if (words.length === 0) return null;

  let best: { heading: string; hits: number } | null = null;
  for (const section of sections) {
    const body = section.body.toLowerCase();
    const hits = words.filter((word) => body.includes(word)).length;
    if (hits > (best?.hits ?? 0)) best = { heading: section.heading, hits };
  }
  // Half the distinctive words is a match; less is a coincidence.
  return best && best.hits >= Math.max(1, Math.ceil(words.length / 2)) ? best.heading : null;
}

/* ------------------------------------------------------------------ */
/* Sources                                                             */
/* ------------------------------------------------------------------ */

function citationsFrom(
  sections: ScriptSection[],
  research: YoutubeResearch | null,
  findings: FactCheckFinding[],
): SourceCitation[] {
  const citations: SourceCitation[] = [];

  for (const fact of [...(research?.facts ?? []), ...(research?.statistics ?? [])]) {
    citations.push({
      source: fact.source,
      claim: fact.claim,
      location: locate(fact.claim, sections),
    });
  }

  // A fact check can name a source the research never recorded.
  for (const finding of findings) {
    const source = sourceInReasoning(finding.reasoning);
    if (!source) continue;
    citations.push({
      source,
      claim: finding.claim,
      location: locate(finding.claim, sections),
    });
  }

  return citations;
}

/* ------------------------------------------------------------------ */
/* Versions                                                            */
/* ------------------------------------------------------------------ */

/**
 * Consecutive pairs, newest first.
 *
 * Section-by-section rather than whole-document, because a section that moved
 * would otherwise render as one enormous deletion followed by one enormous
 * insertion. Sections are matched on heading, which is how a writer thinks
 * about them; a renamed heading reads as a removal plus an addition, which is
 * accurate — the operator can see both.
 */
export function buildDiffs(
  versions: YoutubeScriptVersion[],
): { from: number; to: number; sections: SectionDiff[] }[] {
  const ordered = [...versions].sort((a, b) => b.version - a.version);
  const diffs: { from: number; to: number; sections: SectionDiff[] }[] = [];

  for (let i = 0; i < ordered.length - 1; i += 1) {
    const after = ordered[i]!;
    const before = ordered[i + 1]!;
    diffs.push({
      from: before.version,
      to: after.version,
      sections: diffSections(before.sections, after.sections),
    });
  }
  return diffs;
}

export function diffSections(before: ScriptSection[], after: ScriptSection[]): SectionDiff[] {
  const key = (section: ScriptSection) => section.heading.trim().toLowerCase();
  const beforeByKey = new Map(before.map((section) => [key(section), section]));
  const afterByKey = new Map(after.map((section) => [key(section), section]));
  const out: SectionDiff[] = [];

  for (const section of after) {
    const previous = beforeByKey.get(key(section));
    if (!previous) {
      out.push({
        heading: section.heading,
        status: 'added',
        before: [],
        after: [{ text: section.body, change: 'add' }],
      });
      continue;
    }
    if (previous.body === section.body) {
      out.push({
        heading: section.heading,
        status: 'unchanged',
        before: [{ text: previous.body, change: 'same' }],
        after: [{ text: section.body, change: 'same' }],
      });
      continue;
    }
    const diff = diffWords(previous.body, section.body);
    out.push({
      heading: section.heading,
      status: 'modified',
      before: diff.before,
      after: diff.after,
    });
  }

  for (const section of before) {
    if (afterByKey.has(key(section))) continue;
    out.push({
      heading: section.heading,
      status: 'removed',
      before: [{ text: section.body, change: 'remove' }],
      after: [],
    });
  }

  return out;
}

/* ------------------------------------------------------------------ */
/* Cost and metadata                                                   */
/* ------------------------------------------------------------------ */

async function productionCost(
  store: DataStore,
  missionId: string | null,
): Promise<{ amount: number; seconds: number | null }> {
  if (!missionId) return { amount: 0, seconds: null };

  const tasks = await store.list('tasks', { where: { mission_id: missionId } }).catch(() => []);
  const usage = (
    await Promise.all(
      tasks.map((task) => store.list('api_usage', { where: { task_id: task.id } }).catch(() => [])),
    )
  ).flat();

  if (usage.length === 0) return { amount: 0, seconds: null };
  return {
    amount: usage.reduce((total, row) => total + row.estimated_cost, 0),
    seconds: usage.reduce((total, row) => total + row.duration_ms, 0) / 1000,
  };
}

/** Metadata is written later in the pipeline; its absence is normal. */
async function metadataFor(
  store: DataStore,
  scriptId: string,
): Promise<{ title: string; description: string; tags: string[] } | null> {
  const videos = await store
    .list('youtube_videos', { where: { script_id: scriptId } })
    .catch(() => []);
  const metadataId = videos.find((video) => video.metadata_id)?.metadata_id;
  if (!metadataId) return null;

  const row = await store.get('youtube_metadata', metadataId).catch(() => null);
  return row ? { title: row.title, description: row.description, tags: row.tags } : null;
}

function latest(checks: YoutubeFactCheck[]): YoutubeFactCheck | null {
  if (checks.length === 0) return null;
  return [...checks].sort((a, b) => b.created_at.localeCompare(a.created_at))[0]!;
}
