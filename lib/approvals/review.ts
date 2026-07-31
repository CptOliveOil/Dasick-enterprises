import 'server-only';
import type { DataStore, TableName } from '@/lib/db/tables';
import type { Approval } from '@/types/domain';

/**
 * Turns an approval into the work it is asking about.
 *
 * The rule this exists to enforce: **nobody is asked to approve something they
 * cannot see.** An approval that says "found 5 opportunities" and shows none of
 * them is not a decision, it is a rubber stamp — and the operator has no way to
 * tell a good five from a bad five.
 *
 * Deliberately generic. Nothing here knows what a Pokémon idea is. A resolver
 * says "this payload key holds ids in that table, and that column is the
 * title"; everything else — which fields exist, what they are called, how they
 * render — is derived from the row itself. Adding a reviewable kind is a line
 * in RESOLVERS, not a component.
 *
 * And when no resolver matches, the payload is rendered as itself rather than
 * hidden. An unreviewable approval is the failure this module exists to
 * prevent, so there is no path that produces one.
 */

export type ReviewTone = 'neutral' | 'emerald' | 'amber' | 'red';

export interface ReviewField {
  label: string;
  value: string;
  /** Rendered as a paragraph rather than a single line. */
  long?: boolean;
}

export interface ReviewItem {
  id: string;
  title: string;
  subtitle?: string | null;
  badges?: { label: string; tone?: ReviewTone }[];
  fields: ReviewField[];
}

export interface ApprovalReview {
  /** Plain language: what approving actually does. */
  action: string;
  items: ReviewItem[];
  /** Figures that are not items — counts, costs, verdicts. */
  facts: { label: string; value: string; tone?: ReviewTone }[];
  /** A page showing the whole thing, when one exists. */
  href: string | null;
  notice: string | null;
  /**
   * Where the items came from. `records` means the stored rows were read back,
   * so this is the work itself; `payload` means the approval's own snapshot was
   * used because the rows are gone. Shown to the operator, because reviewing a
   * snapshot of deleted work is a different thing from reviewing the work.
   */
  source: 'records' | 'payload' | 'none';
}

/* ------------------------------------------------------------------ */
/* Presentation helpers                                                */
/* ------------------------------------------------------------------ */

/** Bookkeeping the operator does not need to review. */
const HIDDEN_KEYS = new Set([
  'id',
  'owner_id',
  'business_id',
  'channel_id',
  'mission_id',
  'task_id',
  'agent_id',
  'idea_id',
  'script_id',
  'video_id',
  'product_id',
  'approval_id',
  'resolution_id',
  'source_check_id',
  'created_at',
  'updated_at',
  'is_demo',
  'status',
  'version',
]);

/** `title_concept` → `Title concept`. */
export function humanise(key: string): string {
  const spaced = key.replace(/_/g, ' ').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Anything a person can read. Objects become indented JSON as a last resort. */
export function readable(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value.trim() ? value : null;
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(2);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    const parts = value.map((entry) => readable(entry)).filter((part): part is string => !!part);
    return parts.length > 0 ? parts.join('\n') : null;
  }
  if (typeof value === 'object') {
    const json = JSON.stringify(value, null, 2);
    return json === '{}' ? null : json;
  }
  return String(value);
}

/** True when a value wants a paragraph rather than a line. */
function isLong(value: string): boolean {
  return value.length > 70 || value.includes('\n');
}

/**
 * One reviewable item from one row, without knowing what the row is.
 *
 * Named fields come first in the order given, so the important thing is at the
 * top; everything else follows in the row's own order. Nothing is dropped
 * except the bookkeeping in HIDDEN_KEYS, because a field the operator cannot
 * see is a field they cannot judge.
 */
export function itemFromRecord(
  row: Record<string, unknown>,
  options: {
    titleKey: string;
    subtitleKey?: string;
    badgeKeys?: string[];
    /** Shown first, in this order. */
    leadKeys?: string[];
    fallbackTitle?: string;
  },
): ReviewItem {
  const { titleKey, subtitleKey, badgeKeys = [], leadKeys = [] } = options;

  const badges = badgeKeys
    .map((key) => {
      const value = readable(row[key]);
      return value ? { label: value, tone: toneFor(key, row[key]) } : null;
    })
    .filter((badge): badge is { label: string; tone: ReviewTone } => badge !== null);

  const skip = new Set([...HIDDEN_KEYS, titleKey, ...(subtitleKey ? [subtitleKey] : []), ...badgeKeys]);
  const ordered = [...leadKeys.filter((key) => key in row), ...Object.keys(row)];
  const seen = new Set<string>();
  const fields: ReviewField[] = [];

  for (const key of ordered) {
    if (seen.has(key) || skip.has(key)) continue;
    seen.add(key);
    const value = readable(row[key]);
    if (value === null) continue;
    fields.push({ label: humanise(key), value, long: isLong(value) });
  }

  return {
    id: String(row.id ?? row[titleKey] ?? Math.random()),
    title: readable(row[titleKey]) ?? options.fallbackTitle ?? 'Untitled',
    subtitle: subtitleKey ? readable(row[subtitleKey]) : null,
    badges: badges.length > 0 ? badges : undefined,
    fields,
  };
}

/** Colour only where a value genuinely carries a warning. */
function toneFor(key: string, value: unknown): ReviewTone {
  const text = String(value ?? '').toLowerCase();
  if (key === 'ip_risk') {
    return text === 'blocked' || text === 'high' ? 'red' : text === 'medium' ? 'amber' : 'neutral';
  }
  if (key === 'verdict') {
    return text === 'pass' ? 'emerald' : text === 'fail' ? 'red' : 'amber';
  }
  if (key === 'lifespan') return text === 'evergreen' ? 'emerald' : 'amber';
  return 'neutral';
}

/* ------------------------------------------------------------------ */
/* Resolvers                                                           */
/* ------------------------------------------------------------------ */

interface Resolver {
  /** Payload key holding one id or an array of them. */
  key: string;
  /**
   * Restricts this resolver to certain approval kinds.
   *
   * Needed because one payload key can mean two things: `video_id` on a
   * thumbnail approval points at the video whose *concepts* are being reviewed,
   * and on a video approval points at the video itself.
   */
  kinds?: Approval['kind'][];
  table: TableName;
  /**
   * When set, the payload id is a parent and the rows are its children found
   * through this column — rather than the id being the row's own.
   */
  childColumn?: string;
  titleKey: string;
  subtitleKey?: string;
  badgeKeys?: string[];
  leadKeys?: string[];
  /** What approving these does, in the operator's language. */
  action: string;
  href?: (id: string) => string;
}

/**
 * Payload shape → stored rows. Order matters only in that the first match wins.
 *
 * Every entry is the same three facts: where the ids are, which table they are
 * in, and which column reads as a title. That is all a new reviewable kind
 * needs — no component, no branch in the UI.
 */
const RESOLVERS: Resolver[] = [
  {
    key: 'opportunity_ids',
    table: 'pokemon_opportunities',
    titleKey: 'title_concept',
    subtitleKey: 'hook',
    badgeKeys: ['category', 'lifespan', 'ip_risk'],
    leadKeys: [
      'why_watch',
      'target_audience',
      'suggested_minutes',
      'confidence',
      'research_required',
    ],
    action: 'Approving accepts these as opportunities worth pursuing. Nothing is published and nothing is spent.',
  },
  {
    key: 'idea_ids',
    table: 'youtube_ideas',
    titleKey: 'title',
    subtitleKey: 'summary',
    badgeKeys: ['niche'],
    leadKeys: ['topic', 'target_audience', 'why_it_might_work', 'score'],
    action: 'Approving accepts these ideas. Production does not begin until you ask for it.',
  },
  {
    key: 'concept_ids',
    table: 'youtube_thumbnail_concepts',
    titleKey: 'headline',
    subtitleKey: 'rationale',
    action: 'Approving selects these thumbnail concepts for rendering.',
  },
  {
    // A thumbnail approval names the video; the concepts hang off it. Resolving
    // children by foreign key means an approval that only carries a parent id
    // is still reviewable.
    key: 'video_id',
    kinds: ['thumbnail'],
    table: 'youtube_thumbnail_concepts',
    childColumn: 'video_id',
    titleKey: 'headline',
    subtitleKey: 'rationale',
    leadKeys: ['style', 'focal_point', 'text_overlay'],
    action: 'Approving selects these thumbnail concepts for rendering.',
  },
  {
    key: 'video_id',
    kinds: ['video'],
    table: 'youtube_videos',
    titleKey: 'title',
    subtitleKey: 'description',
    badgeKeys: ['stage', 'status'],
    action: 'Approving marks the video ready to publish. Publishing is a separate, gated action.',
    href: (id) => `/youtube/production/${id}`,
  },
  {
    key: 'memory_id',
    table: 'agent_memory',
    titleKey: 'content',
    badgeKeys: ['type', 'importance'],
    action: 'Approving lets the agent keep this as a durable rule that shapes every later run.',
  },
  {
    key: 'listing_id',
    table: 'etsy_listings',
    titleKey: 'title',
    subtitleKey: 'description',
    leadKeys: ['tags', 'price'],
    action: 'Approving marks the listing ready. Publishing to Etsy is a separate, gated action.',
  },
  {
    key: 'metadata_id',
    table: 'youtube_metadata',
    titleKey: 'title',
    subtitleKey: 'description',
    leadKeys: ['tags'],
    action: 'Approving accepts the title, description and tags this video will carry.',
  },
  {
    key: 'research_id',
    table: 'youtube_research',
    titleKey: 'overview',
    leadKeys: ['facts', 'risks', 'uncertain_claims'],
    action: 'Approving accepts this research as the basis for a script.',
  },
];

function idsFrom(payload: Record<string, unknown>, key: string): string[] {
  const value = payload[key];
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.filter((entry): entry is string => typeof entry === 'string');
  return [];
}

/* ------------------------------------------------------------------ */
/* Build                                                               */
/* ------------------------------------------------------------------ */

/** How many items to render. Enough to review, bounded so a page stays usable. */
const MAX_ITEMS = 25;

export async function buildApprovalReview(
  store: DataStore,
  ownerId: string,
  approval: Approval,
): Promise<ApprovalReview> {
  const payload = (approval.payload ?? {}) as Record<string, unknown>;
  const facts: ApprovalReview['facts'] = [];

  // Figures worth surfacing whatever the kind, read straight off the payload.
  if (typeof payload.count === 'number') {
    facts.push({ label: 'Generated', value: String(payload.count) });
  }
  if (typeof payload.estimate === 'number') {
    facts.push({ label: 'Estimated cost', value: payload.estimate.toFixed(2), tone: 'amber' });
  }
  if (typeof payload.word_count === 'number') {
    facts.push({ label: 'Words', value: payload.word_count.toLocaleString('en-GB') });
  }
  if (typeof payload.verdict === 'string') {
    facts.push({
      label: 'Quality check',
      value: payload.verdict,
      tone: toneFor('verdict', payload.verdict),
    });
  }
  const notice =
    payload.simulated === true
      ? 'This output came from the simulated provider, not a real model. It is placeholder text.'
      : typeof payload.needs_live_data === 'number' && payload.needs_live_data > 0
        ? `${payload.needs_live_data} of these need a live data source before they can be stated as fact.`
        : null;

  // 1. The stored records, when the payload points at any.
  for (const resolver of RESOLVERS) {
    if (resolver.kinds && !resolver.kinds.includes(approval.kind)) continue;
    const ids = idsFrom(payload, resolver.key);
    if (ids.length === 0) continue;

    const rows = resolver.childColumn
      ? (
          await store
            .list(resolver.table, {
              where: { [resolver.childColumn]: ids[0] } as never,
              limit: MAX_ITEMS,
            })
            .catch(() => [])
        ).filter(Boolean)
      : (
          await Promise.all(
            ids.slice(0, MAX_ITEMS).map((id) => store.get(resolver.table, id).catch(() => null)),
          )
        ).filter((row): row is NonNullable<typeof row> => row !== null);

    if (rows.length > 0) {
      return {
        action: resolver.action,
        items: rows.map((row) =>
          itemFromRecord(row as unknown as Record<string, unknown>, {
            titleKey: resolver.titleKey,
            subtitleKey: resolver.subtitleKey,
            badgeKeys: resolver.badgeKeys,
            leadKeys: resolver.leadKeys,
          }),
        ),
        facts,
        href: resolver.href && ids[0] ? resolver.href(ids[0]) : null,
        notice,
        source: 'records',
      };
    }
    // Rows gone — fall through to the payload snapshot rather than showing
    // nothing. Reviewing a snapshot is worse than reviewing the work, and much
    // better than reviewing a summary.
  }

  // 2. A script is its sections, which live on the row rather than in a list.
  if (typeof payload.script_id === 'string') {
    const script = await store.get('youtube_scripts', payload.script_id).catch(() => null);
    if (script) {
      const sections = Array.isArray(script.sections) ? script.sections : [];
      return {
        action:
          'Approving releases this script into production. Narration, visuals and rendering begin, and they cost money.',
        items: sections.map((section, index) => {
          const entry = section as unknown as Record<string, unknown>;
          return {
            id: `${script.id}:${index}`,
            title: readable(entry.heading) ?? `Section ${index + 1}`,
            subtitle: readable(entry.purpose),
            fields: [
              { label: 'Script', value: readable(entry.body) ?? '', long: true },
            ].filter((field) => field.value.length > 0),
          };
        }),
        facts,
        href: `/youtube/scripts/${script.id}`,
        notice,
        source: 'records',
      };
    }
  }

  // 3. Anything the payload itself carries as reviewable content. This is what
  //    makes the guarantee hold for kinds nothing above knows about: the
  //    approval's own snapshot of the work is rendered rather than hidden.
  const embedded = embeddedItems(payload);
  if (embedded.length > 0) {
    return {
      action: describeAction(approval),
      items: embedded,
      facts,
      href: null,
      notice,
      source: 'payload',
    };
  }

  // 4. Last resort: the payload as readable fields. Never nothing.
  const fields = Object.entries(payload)
    .filter(([key]) => !HIDDEN_KEYS.has(key) && !key.endsWith('_ids'))
    .flatMap<ReviewField>(([key, value]) => {
      const text = readable(value);
      return text ? [{ label: humanise(key), value: text, long: isLong(text) }] : [];
    });

  return {
    action: describeAction(approval),
    items:
      fields.length > 0
        ? [{ id: approval.id, title: approval.title, fields }]
        : [],
    facts,
    href: null,
    notice,
    source: fields.length > 0 ? 'payload' : 'none',
  };
}

/**
 * Arrays of objects sitting directly in the payload — the shape a handler uses
 * when it hands work forward. Rendered the same way stored rows are.
 */
function embeddedItems(payload: Record<string, unknown>): ReviewItem[] {
  for (const [key, value] of Object.entries(payload)) {
    if (!Array.isArray(value) || value.length === 0) continue;
    if (!value.every((entry) => entry && typeof entry === 'object' && !Array.isArray(entry))) {
      continue;
    }
    const rows = value.slice(0, MAX_ITEMS) as Record<string, unknown>[];
    const first = rows[0]!;
    // The title is whichever of these the objects actually have.
    const titleKey =
      ['title_concept', 'title', 'headline', 'name', 'claim', 'label', 'heading'].find(
        (candidate) => typeof first[candidate] === 'string',
      ) ?? Object.keys(first)[0]!;
    return rows.map((row, index) =>
      itemFromRecord(row, {
        titleKey,
        subtitleKey: typeof row.hook === 'string' ? 'hook' : undefined,
        badgeKeys: ['category', 'lifespan', 'ip_risk'].filter((k) => k in row),
        fallbackTitle: `${humanise(key)} ${index + 1}`,
      }),
    );
  }
  return [];
}

/** What approving does, for kinds without a resolver of their own. */
function describeAction(approval: Approval): string {
  switch (approval.kind) {
    case 'spend':
      return 'Approving authorises this one step to spend. It does not raise any ceiling and does not authorise anything else.';
    case 'publish':
      return 'Approving publishes this externally. It leaves Command Centre and cannot be taken back.';
    case 'video':
      return 'Approving marks the video ready to publish. Publishing is a separate, gated action.';
    case 'product':
      return 'Approving accepts this product concept. Nothing is listed or sold.';
    case 'memory':
      return 'Approving lets the agent keep this as a durable rule that shapes every later run.';
    case 'source':
      return 'Approving closes the source gate. Every claim must be settled first.';
    default:
      return 'Approving accepts this work and lets the mission continue. Nothing is published.';
  }
}
