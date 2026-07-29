import type { Timestamp, UUID } from './domain';

/**
 * Islamic content types.
 *
 * The design principle throughout: a religious claim is only as good as where it
 * came from, so *provenance is a first-class field*, never an afterthought. A
 * model that does not reliably know something must be able to say so — which is
 * why almost every reference field below is nullable. `null` is a legitimate,
 * expected answer. An invented citation is not.
 */

/* ------------------------------------------------------------------ */
/* Source classification                                               */
/* ------------------------------------------------------------------ */

export const SOURCE_CATEGORIES = [
  'QURAN',
  'SAHIH_HADITH',
  'OTHER_HADITH',
  'CLASSICAL_SCHOLAR',
  'CONTEMPORARY_SCHOLAR',
  'HISTORICAL_SOURCE',
  'GENERAL_CONTEXT',
  'UNVERIFIED',
] as const;
export type SourceCategory = (typeof SOURCE_CATEGORIES)[number];

export const SOURCE_CATEGORY_LABELS: Record<SourceCategory, string> = {
  QURAN: 'Qur’an',
  SAHIH_HADITH: 'Sahih hadith',
  OTHER_HADITH: 'Other hadith',
  CLASSICAL_SCHOLAR: 'Classical scholar',
  CONTEMPORARY_SCHOLAR: 'Contemporary scholar',
  HISTORICAL_SOURCE: 'Historical source',
  GENERAL_CONTEXT: 'General context',
  UNVERIFIED: 'Unverified',
};

export const SOURCE_CATEGORY_DESCRIPTIONS: Record<SourceCategory, string> = {
  QURAN: 'Directly from the Qur’an, with surah and ayah.',
  SAHIH_HADITH: 'A hadith reported in a collection and graded authentic.',
  OTHER_HADITH: 'A hadith whose grading is weaker, disputed or not established.',
  CLASSICAL_SCHOLAR: 'A position attributed to a scholar of the earlier centuries.',
  CONTEMPORARY_SCHOLAR: 'A position attributed to a present-day scholar or body.',
  HISTORICAL_SOURCE: 'Historical or biographical material, not itself a religious proof.',
  GENERAL_CONTEXT: 'Background or explanation carrying no claim of religious authority.',
  UNVERIFIED: 'Nothing reliable stands behind this yet. It must not be presented as established.',
};

/** Categories that carry religious authority, and so must be verified before use. */
export const AUTHORITATIVE_CATEGORIES: SourceCategory[] = [
  'QURAN',
  'SAHIH_HADITH',
  'OTHER_HADITH',
  'CLASSICAL_SCHOLAR',
  'CONTEMPORARY_SCHOLAR',
];

/* ------------------------------------------------------------------ */
/* Verification                                                        */
/* ------------------------------------------------------------------ */

export const VERIFICATION_STATUSES = [
  'VERIFIED',
  'ACCEPTABLE_WITH_CONTEXT',
  'DIFFERENCE_OF_OPINION',
  'NEEDS_SOURCE',
  'QUESTIONABLE',
  'INCORRECT',
] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const VERIFICATION_LABELS: Record<VerificationStatus, string> = {
  VERIFIED: 'Verified',
  ACCEPTABLE_WITH_CONTEXT: 'Acceptable with context',
  DIFFERENCE_OF_OPINION: 'Difference of opinion',
  NEEDS_SOURCE: 'Needs a source',
  QUESTIONABLE: 'Questionable',
  INCORRECT: 'Incorrect',
};

/**
 * How each verdict moves the pipeline.
 *
 * Three outcomes, not two. The distinction that matters is between a *defect*
 * and an *unfinished job*: `INCORRECT` and `QUESTIONABLE` are the checker
 * saying something is wrong, which stops everything; `NEEDS_SOURCE` is the
 * checker saying it could not finish, which is a task for a person, not a
 * failure. Collapsing those two into one state would either wave real errors
 * through or make an ordinary missing citation look like a broken mission.
 */
export const VERIFICATION_OUTCOMES = ['continue', 'note', 'resolve', 'block'] as const;
export type VerificationOutcome = (typeof VERIFICATION_OUTCOMES)[number];

export const STATUS_OUTCOMES: Record<VerificationStatus, VerificationOutcome> = {
  VERIFIED: 'continue',
  ACCEPTABLE_WITH_CONTEXT: 'note',
  // Continues only when the script actually carries the context; checked in
  // `missingDifferenceContext` rather than assumed.
  DIFFERENCE_OF_OPINION: 'note',
  NEEDS_SOURCE: 'resolve',
  QUESTIONABLE: 'block',
  INCORRECT: 'block',
};

export function outcomeOf(status: VerificationStatus): VerificationOutcome {
  return STATUS_OUTCOMES[status];
}

/** Findings that are defects: the content is wrong and must not progress. */
export const BLOCKING_STATUSES: VerificationStatus[] = ['INCORRECT', 'QUESTIONABLE'];

export function isBlocking(status: VerificationStatus): boolean {
  return outcomeOf(status) === 'block';
}

/** Findings that pause the mission for the operator to resolve or override. */
export const RESOLUTION_STATUSES: VerificationStatus[] = ['NEEDS_SOURCE'];

export function needsResolution(status: VerificationStatus): boolean {
  return outcomeOf(status) === 'resolve';
}

/* ------------------------------------------------------------------ */
/* Source resolution                                                   */
/* ------------------------------------------------------------------ */

export const RESOLUTION_ACTIONS = [
  'add_source',
  'research',
  'edit_claim',
  'remove_claim',
  'override',
] as const;
export type ResolutionAction = (typeof RESOLUTION_ACTIONS)[number];

export const RESOLUTION_ACTION_LABELS: Record<ResolutionAction, string> = {
  add_source: 'Add source',
  research: 'Ask Source Checker to research',
  edit_claim: 'Edit claim',
  remove_claim: 'Remove claim',
  override: 'Override and continue',
};

/**
 * One unsourced claim, and what the operator did about it.
 *
 * An override is a deliberate, attributable act: it records who, when and — if
 * given — why, and it stays attached to the video through to the final QC
 * report. A decision to publish something unverified should be visible at the
 * moment of publishing, not buried in an audit log nobody opens.
 */
export interface SourceResolution {
  id: UUID;
  claim: string;
  reason: string;
  /** Whatever source was cited, if any. Null means nothing was offered. */
  current_source: string | null;
  location: string | null;
  category: SourceCategory;
  status: 'unresolved' | 'resolved' | 'overridden' | 'removed';
  action: ResolutionAction | null;
  /** The reference the operator supplied, or the checker found on a re-run. */
  resolved_source: string | null;
  /** Replacement wording, when the operator edited the claim. */
  edited_claim: string | null;
  override_reason: string | null;
  resolved_by: UUID | null;
  resolved_at: Timestamp | null;
}

export interface SourceResolutionRecord {
  id: UUID;
  owner_id: UUID;
  business_id: UUID;
  source_check_id: UUID | null;
  script_id: UUID | null;
  video_id: UUID | null;
  mission_id: UUID | null;
  task_id: UUID | null;
  approval_id: UUID | null;
  items: SourceResolution[];
  status: 'open' | 'resolved';
  is_demo: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
}

/** Overrides that must be shown prominently wherever the video is approved. */
export function overriddenItems(record: SourceResolutionRecord | null): SourceResolution[] {
  return (record?.items ?? []).filter((item) => item.status === 'overridden');
}

export function unresolvedItems(record: SourceResolutionRecord | null): SourceResolution[] {
  return (record?.items ?? []).filter((item) => item.status === 'unresolved');
}

/**
 * A difference of opinion may only pass when the script actually says so.
 *
 * The checker reporting "scholars differ here" is not the same as the audience
 * being told. This looks for the telling in the text, and returns the findings
 * whose context is missing.
 */
const DIFFERENCE_CONTEXT =
  /(scholars?\s+(differ|disagree|have\s+differed)|difference\s+of\s+opinion|opinions?\s+(differ|vary)|some\s+scholars?|according\s+to\s+(some|others)|there\s+is\s+(a\s+)?(disagreement|difference)|not\s+agreed\s+upon|ikhtilaf)/i;

export function scriptCarriesDifferenceContext(scriptText: string): boolean {
  return DIFFERENCE_CONTEXT.test(scriptText);
}

/* ------------------------------------------------------------------ */
/* Stored records                                                      */
/* ------------------------------------------------------------------ */

export interface QuranEvidence {
  surah: string;
  surah_number: number | null;
  ayah_number: string | null;
  /** Only when reliably known verbatim. Null otherwise — never approximated. */
  arabic: string | null;
  translation: string | null;
  translation_source: string | null;
  reference: string | null;
  relevance: string;
}

export const HADITH_GRADINGS = [
  'sahih',
  'hasan',
  'daif',
  'mawdu',
  'disputed',
  'unknown',
] as const;
export type HadithGrading = (typeof HADITH_GRADINGS)[number];

export const HADITH_GRADING_LABELS: Record<HadithGrading, string> = {
  sahih: 'Sahih (authentic)',
  hasan: 'Hasan (good)',
  daif: 'Da’if (weak)',
  mawdu: 'Mawdu’ (fabricated)',
  disputed: 'Disputed',
  unknown: 'Grading not established',
};

/** Gradings that must never be presented as established teaching. */
export const WEAK_GRADINGS: HadithGrading[] = ['daif', 'mawdu', 'disputed', 'unknown'];

export interface HadithEvidence {
  collection: string;
  reference: string | null;
  narrator: string | null;
  text: string;
  arabic: string | null;
  grading: HadithGrading;
  grading_source: string | null;
  relevance: string;
}

export interface ScholarlyPoint {
  position: string;
  attributed_to: string | null;
  category: SourceCategory;
  reference: string | null;
  note: string;
}

export interface SensitiveClaim {
  claim: string;
  why_sensitive: string;
  recommendation: string;
}

export interface IslamicSourceRef {
  label: string;
  category: SourceCategory;
  reference: string | null;
  note: string;
}

export interface IslamicResearch {
  id: UUID;
  business_id: UUID;
  channel_id: UUID | null;
  mission_id: UUID | null;
  task_id: UUID | null;
  idea_id: UUID | null;
  topic: string;
  summary: string;
  audience: string;
  content_goal: string;
  quran_evidence: QuranEvidence[];
  hadith_evidence: HadithEvidence[];
  scholarly_context: ScholarlyPoint[];
  historical_context: string[];
  key_points: string[];
  areas_of_difference: string[];
  sensitive_claims: SensitiveClaim[];
  sources: IslamicSourceRef[];
  /** The agent's own honest assessment of how well-sourced this package is. */
  verification_status: 'unreviewed' | 'reviewed' | 'blocked';
  notes: string;
  is_demo: boolean;
  created_at: Timestamp;
}

export interface SourceFinding {
  claim: string;
  location: string | null;
  category: SourceCategory;
  status: VerificationStatus;
  explanation: string;
  correction: string | null;
  required_action: string | null;
}

export interface IslamicSourceCheck {
  id: UUID;
  business_id: UUID;
  research_id: UUID | null;
  script_id: UUID | null;
  video_id: UUID | null;
  mission_id: UUID | null;
  task_id: UUID | null;
  /** 'research' when checking a package, 'script' when reviewing a draft. */
  subject: 'research' | 'script';
  verdict: 'pass' | 'pass_with_notes' | 'blocked';
  summary: string;
  findings: SourceFinding[];
  outstanding: string[];
  policy_violations: string[];
  is_demo: boolean;
  created_at: Timestamp;
}

/* ------------------------------------------------------------------ */
/* Per-channel policy                                                  */
/* ------------------------------------------------------------------ */

export const WEAK_HADITH_POLICIES = ['never', 'labelled', 'allowed'] as const;
export type WeakHadithPolicy = (typeof WEAK_HADITH_POLICIES)[number];

export const WEAK_HADITH_POLICY_LABELS: Record<WeakHadithPolicy, string> = {
  never: 'Never use weak hadith',
  labelled: 'Only with explicit labelling',
  allowed: 'Allowed without labelling',
};

/**
 * How a channel wants religious sourcing handled.
 *
 * Every field is a *choice*, with a conservative default. Nothing here encodes
 * a madhhab, a school or a theological position — the application does not have
 * one, and it is not the place to acquire one.
 */
export interface SourcePolicy {
  id: UUID;
  owner_id: UUID;
  business_id: UUID;
  channel_id: UUID | null;
  /** Free text. Describe the methodology the channel follows, if any. */
  methodology_notes: string;
  preferred_translation: string;
  /** Free text. How sources should be cited on screen and in descriptions. */
  source_policy_notes: string;
  arabic_display: 'none' | 'arabic_only' | 'arabic_with_translation' | 'translation_only';
  religious_disclaimer: string;
  require_quran_reference: boolean;
  require_hadith_grading: boolean;
  require_source_check_before_script_approval: boolean;
  weak_hadith_policy: WeakHadithPolicy;
  require_difference_labelling: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
}

/**
 * Visual constraints for a channel.
 *
 * These reach the Visual Director and the Asset Agent as hard constraints in
 * their prompt, and the ones that can be checked mechanically are also enforced
 * after the fact — a restriction that only exists as a polite request in a
 * prompt is not a restriction.
 */
export interface VisualRules {
  id: UUID;
  owner_id: UUID;
  business_id: UUID;
  channel_id: UUID | null;
  no_prophet_depiction: boolean;
  no_divine_depiction: boolean;
  no_generated_sacred_text: boolean;
  require_calligraphy_approval: boolean;
  human_depiction: 'none' | 'faceless' | 'allowed';
  background_music: 'none' | 'ambient_only' | 'allowed';
  extra_notes: string;
  created_at: Timestamp;
  updated_at: Timestamp;
}

/** Optional channel profile fields. All optional; none assume a position. */
export interface IslamicChannelProfile {
  content_school_or_methodology_notes: string;
  preferred_translation: string;
  preferred_source_policy: string;
  arabic_display_preferences: string;
  religious_content_disclaimer: string;
  visual_restrictions: string;
}
