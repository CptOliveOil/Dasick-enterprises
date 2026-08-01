import type { ApprovalKind, ApprovalStatus } from '@/types/domain';
import type { ReviewField, ReviewItem, ReviewTone } from '@/lib/approvals/review';

/**
 * The shape every approval takes when it is put in front of an operator.
 *
 * One rule drives the whole file: **nobody approves work they cannot fully
 * inspect.** A fact-check summary that says "1 claim checked, 1 warning" is a
 * receipt, not a review — it tells the operator that something happened and
 * gives them no way to judge whether it happened well.
 *
 * So an approval is a *dossier*: a summary you can scan, panels you can read,
 * and actions whose consequences are spelled out. The three parts are exactly
 * what the request asked every approval to register — summary, review, action —
 * and they are declared as data rather than components, which is what lets a
 * business added in a year's time inherit the whole review experience without
 * anyone writing a screen for it.
 *
 * Nothing here knows what a script is, what YouTube is, or what Pokémon is.
 * Panels are a closed set of *presentation* shapes — a document, a set of
 * claims, a source list, a score board, a storyboard, a version comparison, a
 * list of items, a table of fields. A new business supplies rows; the renderer
 * is already written.
 */

export type Tone = ReviewTone | 'sky';

export interface Metric {
  label: string;
  value: string;
  /** Where the figure comes from, so a number is never bare. */
  hint?: string;
  tone?: Tone;
}

export interface DossierSummary {
  title: string;
  subtitle: string | null;
  /** Business, mission, agent — the provenance of the work. */
  attribution: { label: string; value: string }[];
  metrics: Metric[];
  /** A caveat that must be read before deciding, or null. */
  notice: string | null;
}

/* ------------------------------------------------------------------ */
/* Panels                                                              */
/* ------------------------------------------------------------------ */

interface PanelBase {
  /** Stable within a dossier. Used as the jump-to anchor. */
  id: string;
  title: string;
  subtitle?: string | null;
  /** Shown at the top of the panel, for anything the operator must know. */
  note?: string | null;
}

/** The work itself when it is prose: a script, a report, an article. */
export interface DocumentBlock {
  id: string;
  /** `Hook`, `Payoff`, `Section 3` — the structural role. */
  label: string;
  heading: string;
  body: string;
  words: number;
  seconds: number;
  tone?: Tone;
}

export interface DocumentPanel extends PanelBase {
  kind: 'document';
  blocks: DocumentBlock[];
  words: number;
  seconds: number;
}

/** Something asserted, and whether it stands up. */
export interface Claim {
  id: string;
  claim: string;
  /** `Verified`, `Needs manual review`, `Unsourced`. */
  status: string;
  tone: Tone;
  /** Why it carries this status. Never optional — a warning with no reason
   *  cannot be acted on, and the operator would have to guess. */
  why: string;
  /** The kind of concern: evidence, bias, copyright, medical, legal, history. */
  category: string;
  source: string | null;
  confidence: string | null;
  correction: string | null;
  /** Which part of the document the claim sits in, when it can be located. */
  location: string | null;
}

export interface ClaimsPanel extends PanelBase {
  kind: 'claims';
  verified: Claim[];
  warnings: Claim[];
}

export interface SourceEntry {
  id: string;
  title: string;
  publisher: string;
  reliability: string;
  tone: Tone;
  /** How many claims lean on it. */
  citations: number;
  usedIn: string[];
  note: string | null;
}

export interface SourceGroup {
  name: string;
  reliability: string;
  tone: Tone;
  sources: SourceEntry[];
}

export interface SourcesPanel extends PanelBase {
  kind: 'sources';
  groups: SourceGroup[];
}

export type ScoreBand = 'strong' | 'fair' | 'weak' | 'unknown';

export interface Score {
  label: string;
  /** 0–100, or null when there is not enough information to judge. */
  value: number | null;
  band: ScoreBand;
  /** What was measured. A score with no stated basis is a number to distrust. */
  basis: string;
}

export interface ScoresPanel extends PanelBase {
  kind: 'scores';
  overall: Score | null;
  scores: Score[];
}

export interface SceneVisual {
  /** `Archive footage`, `B-roll`, `Animation`, `Map`, `Screenshot`, `Graphic`. */
  kind: string;
  suggestion: string;
}

export interface Scene {
  id: string;
  number: number;
  heading: string;
  seconds: number;
  narration: string;
  visuals: SceneVisual[];
}

export interface ScenesPanel extends PanelBase {
  kind: 'scenes';
  scenes: Scene[];
  seconds: number;
}

export type DiffChange = 'same' | 'add' | 'remove';

export interface DiffToken {
  text: string;
  change: DiffChange;
}

export interface SectionDiff {
  heading: string;
  status: 'added' | 'removed' | 'modified' | 'unchanged';
  before: DiffToken[];
  after: DiffToken[];
}

export interface VersionEntry {
  id: string;
  version: number;
  /** The instruction or event that produced it. */
  note: string;
  words: number;
  created_at: string;
}

export interface VersionsPanel extends PanelBase {
  kind: 'versions';
  versions: VersionEntry[];
  /** Consecutive pairs, newest first. */
  diffs: { from: number; to: number; sections: SectionDiff[] }[];
  /** Every decision ever taken on this work. */
  history: { at: string; decision: string; tone: Tone; feedback: string | null }[];
}

/** The generic renderer: rows resolved from the database, shown as cards. */
export interface ItemsPanel extends PanelBase {
  kind: 'items';
  items: ReviewItem[];
  itemNoun: string;
}

/**
 * Something to look at or listen to rather than read.
 *
 * A thumbnail approval that lists a filename is the same failure as a script
 * approval that lists a word count, so images, video and audio are played in
 * place. `url` is null when the asset exists as a row but not yet as a file —
 * shown as "not reachable" rather than as a broken image, because the two mean
 * different things to the person deciding.
 */
export interface MediaItem {
  id: string;
  label: string;
  mediaKind: 'image' | 'video' | 'audio';
  url: string | null;
  note: string | null;
  fields: ReviewField[];
}

export interface MediaPanel extends PanelBase {
  kind: 'media';
  items: MediaItem[];
}

/** Money, laid out so the decision is about a number the operator can see. */
export interface LedgerLine {
  label: string;
  value: string;
  tone?: Tone;
  hint?: string;
  /** Rendered as the headline figure. */
  emphasis?: boolean;
}

export interface LedgerPanel extends PanelBase {
  kind: 'ledger';
  lines: LedgerLine[];
}

/** Last resort, and still a full review: the payload as readable fields. */
export interface FieldsPanel extends PanelBase {
  kind: 'fields';
  fields: ReviewField[];
}

export type Panel =
  | DocumentPanel
  | ClaimsPanel
  | SourcesPanel
  | ScoresPanel
  | ScenesPanel
  | VersionsPanel
  | MediaPanel
  | LedgerPanel
  | ItemsPanel
  | FieldsPanel;

/* ------------------------------------------------------------------ */
/* Actions                                                             */
/* ------------------------------------------------------------------ */

/**
 * A ready-made change instruction.
 *
 * A blank textbox asks the operator to be a director on the spot. Presets turn
 * the common notes into one click, and still compose — several presets plus a
 * custom sentence go to the agent as one brief.
 */
export interface ChangePreset {
  id: string;
  /** What the operator sees. */
  label: string;
  /** For grouping in the UI: `Opening`, `Tone`, `Length`, `Accuracy`… */
  group: string;
  /** What the agent is actually told. */
  instruction: string;
}

export interface DossierActions {
  approve: { label: string; consequence: string };
  reject: { label: string; consequence: string };
  requestChanges: {
    label: string;
    consequence: string;
    presets: ChangePreset[];
  };
}

/* ------------------------------------------------------------------ */
/* The dossier                                                         */
/* ------------------------------------------------------------------ */

export interface Dossier {
  approval: {
    id: string;
    kind: ApprovalKind;
    title: string;
    summary: string;
    status: ApprovalStatus;
    created_at: string;
    resolved_at: string | null;
    feedback: string | null;
  };
  summary: DossierSummary;
  panels: Panel[];
  actions: DossierActions;
  /**
   * The primary document as Markdown, for copy and download. Null when the
   * approval is not about a document.
   */
  document: { title: string; markdown: string } | null;
  /**
   * Where the panels came from. `records` means the stored work was read back;
   * `payload` means the rows are gone and the approval's own snapshot was used.
   * Reviewing a snapshot is a different act from reviewing the work, so it is
   * said out loud rather than hidden.
   */
  source: 'records' | 'payload' | 'none';
  href: string | null;
}

/** What a builder may contribute. Everything is optional except the panels. */
export interface DossierPart {
  summary?: Partial<DossierSummary>;
  panels: Panel[];
  document?: { title: string; markdown: string } | null;
  href?: string | null;
  presets?: ChangePreset[];
  /** Overrides the default description of what approving does. */
  approveConsequence?: string;
  source?: Dossier['source'];
}
