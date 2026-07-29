import type { DataStore } from '@/lib/db/tables';
import type { QualityIssue } from '@/types/production';
import {
  isBlocking,
  needsResolution,
  overriddenItems,
  unresolvedItems,
  VERIFICATION_LABELS,
  type IslamicSourceCheck,
  type SourceResolutionRecord,
} from '@/types/islamic';

/**
 * The religious-sourcing state of one video, gathered for the final quality
 * check and for the SOURCES audit panel.
 *
 * All of it is counted from stored records rather than judged, so the quality
 * check can state it as fact and the model is never asked to assess religious
 * accuracy at the last minute — that already happened, and this is the report.
 */
export interface IslamicAudit {
  applies: boolean;
  quranReferences: number;
  hadithReferences: number;
  scholarlyPoints: number;
  historicalPoints: number;
  unresolvedNeedsSource: number;
  questionable: number;
  incorrect: number;
  differences: number;
  overrides: {
    claim: string;
    reason: string | null;
    resolvedAt: string | null;
    resolvedBy: string | null;
  }[];
  checks: IslamicSourceCheck[];
  resolutions: SourceResolutionRecord[];
}

export const EMPTY_AUDIT: IslamicAudit = {
  applies: false,
  quranReferences: 0,
  hadithReferences: 0,
  scholarlyPoints: 0,
  historicalPoints: 0,
  unresolvedNeedsSource: 0,
  questionable: 0,
  incorrect: 0,
  differences: 0,
  overrides: [],
  checks: [],
  resolutions: [],
};

export async function auditIslamicSources(
  store: DataStore,
  ownerId: string,
  input: { businessId: string | null; videoId: string | null; scriptId: string | null; missionId: string | null },
): Promise<IslamicAudit> {
  if (!input.businessId) return EMPTY_AUDIT;

  const { usesIslamicWorkforce } = await import('./resolve');
  if (!(await usesIslamicWorkforce(store, ownerId, input.businessId))) return EMPTY_AUDIT;

  const [allChecks, allResolutions, research] = await Promise.all([
    store.list('islamic_source_checks', { where: { business_id: input.businessId } }),
    store.list('source_resolutions', { where: { owner_id: ownerId } }),
    store.list('islamic_research', { where: { business_id: input.businessId } }),
  ]);

  const relevant = <T extends { script_id?: string | null; video_id?: string | null; mission_id?: string | null }>(
    rows: T[],
  ) =>
    rows.filter(
      (row) =>
        (input.scriptId && row.script_id === input.scriptId) ||
        (input.videoId && row.video_id === input.videoId) ||
        (input.missionId && row.mission_id === input.missionId),
    );

  const checks = relevant(allChecks);
  const resolutions = relevant(allResolutions);
  const packages = research.filter(
    (row) => input.missionId && row.mission_id === input.missionId,
  );

  const findings = checks.flatMap((check) => check.findings);

  return {
    applies: true,
    quranReferences: packages.reduce((sum, row) => sum + row.quran_evidence.length, 0),
    hadithReferences: packages.reduce((sum, row) => sum + row.hadith_evidence.length, 0),
    scholarlyPoints: packages.reduce((sum, row) => sum + row.scholarly_context.length, 0),
    historicalPoints: packages.reduce((sum, row) => sum + row.historical_context.length, 0),
    // Unresolved is counted from the *resolution records*, not the findings: a
    // finding that has since been sourced or overridden is settled, and only
    // the record knows that.
    unresolvedNeedsSource: resolutions.reduce(
      (sum, record) => sum + unresolvedItems(record).length,
      0,
    ),
    questionable: findings.filter((finding) => finding.status === 'QUESTIONABLE').length,
    incorrect: findings.filter((finding) => finding.status === 'INCORRECT').length,
    differences: findings.filter((finding) => finding.status === 'DIFFERENCE_OF_OPINION').length,
    overrides: resolutions.flatMap((record) =>
      overriddenItems(record).map((item) => ({
        claim: item.claim,
        reason: item.override_reason,
        resolvedAt: item.resolved_at,
        resolvedBy: item.resolved_by,
      })),
    ),
    checks,
    resolutions,
  };
}

/**
 * Turns the audit into quality-check issues.
 *
 * An unresolved QUESTIONABLE or INCORRECT finding fails the video outright — a
 * religious error must never be the thing the operator waves through at the
 * last screen. An override does *not* fail it: the operator already made that
 * call deliberately and on the record. It does raise a warning that stays on
 * the report, so the decision is in front of them again at the moment of final
 * approval rather than buried in a log.
 */
export function islamicQualityIssues(audit: IslamicAudit): QualityIssue[] {
  if (!audit.applies) return [];
  const issues: QualityIssue[] = [];

  if (audit.incorrect > 0) {
    issues.push({
      code: 'islamic_incorrect_claims',
      severity: 'blocking',
      message: `${audit.incorrect} religious claim${audit.incorrect === 1 ? ' is' : 's are'} marked incorrect and ${audit.incorrect === 1 ? 'has' : 'have'} not been resolved.`,
      remedy: 'Correct the claim and re-run the Islamic Source Checker.',
      scene_number: null,
    });
  }
  if (audit.questionable > 0) {
    issues.push({
      code: 'islamic_questionable_claims',
      severity: 'blocking',
      message: `${audit.questionable} religious claim${audit.questionable === 1 ? ' is' : 's are'} marked questionable.`,
      remedy: 'Verify or remove the claim, then re-run the Islamic Source Checker.',
      scene_number: null,
    });
  }
  if (audit.unresolvedNeedsSource > 0) {
    issues.push({
      code: 'islamic_unsourced_claims',
      severity: 'blocking',
      message: `${audit.unresolvedNeedsSource} claim${audit.unresolvedNeedsSource === 1 ? '' : 's'} still ${audit.unresolvedNeedsSource === 1 ? 'has' : 'have'} no source.`,
      remedy: 'Settle each one in the source resolution gate before publishing.',
      scene_number: null,
    });
  }
  if (audit.overrides.length > 0) {
    issues.push({
      code: 'islamic_overridden_claims',
      severity: 'warning',
      message: `${audit.overrides.length} unsourced claim${audit.overrides.length === 1 ? ' was' : 's were'} overridden and will publish without a verified source: ${audit.overrides
        .slice(0, 3)
        .map((item) => `"${item.claim.slice(0, 70)}"`)
        .join('; ')}`,
      remedy: 'Approving this video accepts those claims as they stand.',
      scene_number: null,
    });
  }
  return issues;
}

/** One-line summary for the QC prompt, so the model states facts rather than judging. */
export function describeAudit(audit: IslamicAudit): string {
  if (!audit.applies) return '';
  const parts = [
    `${audit.quranReferences} Qur'an reference(s)`,
    `${audit.hadithReferences} hadith`,
    `${audit.scholarlyPoints} scholarly point(s)`,
    `${audit.differences} difference(s) of opinion`,
    `${audit.unresolvedNeedsSource} claim(s) still unsourced`,
    `${audit.questionable} questionable`,
    `${audit.incorrect} incorrect`,
    `${audit.overrides.length} manual override(s)`,
  ];
  return `Religious sourcing for this video: ${parts.join(', ')}.`;
}

/** Findings grouped for the SOURCES audit panel. */
export function groupFindings(audit: IslamicAudit) {
  const all = audit.checks.flatMap((check) =>
    check.findings.map((finding) => ({ ...finding, check_id: check.id, subject: check.subject })),
  );
  return {
    quran: all.filter((finding) => finding.category === 'QURAN'),
    hadith: all.filter(
      (finding) => finding.category === 'SAHIH_HADITH' || finding.category === 'OTHER_HADITH',
    ),
    scholarly: all.filter(
      (finding) =>
        finding.category === 'CLASSICAL_SCHOLAR' || finding.category === 'CONTEMPORARY_SCHOLAR',
    ),
    historical: all.filter((finding) => finding.category === 'HISTORICAL_SOURCE'),
    other: all.filter(
      (finding) => finding.category === 'GENERAL_CONTEXT' || finding.category === 'UNVERIFIED',
    ),
    blocking: all.filter((finding) => isBlocking(finding.status)),
    outstanding: all.filter((finding) => needsResolution(finding.status)),
    labels: VERIFICATION_LABELS,
  };
}
