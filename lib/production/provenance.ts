import type { MediaAsset } from '@/types/production';

/**
 * Where a visual came from, and whether it may be published.
 *
 * This is the one classification the copyright review is not allowed to guess
 * at. Everything else in that step is judgement; this is bookkeeping, and it is
 * done deterministically here so that an AI response cannot talk the pipeline
 * into believing an asset is cleared when nothing recorded says so.
 *
 * The default is `unresolved`, and `unresolved` blocks. That ordering matters:
 * a system whose default is "probably fine" ships a strike eventually, whereas
 * one whose default is "prove it" only ever costs an operator a few minutes.
 */

export const PROVENANCE = [
  'generated_original',
  'owner_uploaded',
  'public_domain',
  'licensed_stock',
  'permitted_archive',
  'fair_use_review_required',
  'unresolved',
] as const;

export type Provenance = (typeof PROVENANCE)[number];

export interface ProvenanceRecord {
  assetId: string;
  provenance: Provenance;
  provider: string;
  source: string | null;
  creator: string | null;
  licence: string | null;
  attribution: string | null;
  attributionRequired: boolean;
  retrievedAt: string | null;
  restrictions: string[];
  /** Why it was classified this way, for the report. */
  reason: string;
}

/**
 * Asset types a copyright review is actually about.
 *
 * Narration is speech this workspace synthesised from its own script; captions
 * and the render are derived from it. The rights question is about *pictures* —
 * what was put on screen and where it came from — so classifying a subtitle
 * file as "unresolved" would bury the finding that matters under bookkeeping.
 */
const VISUAL_TYPES = new Set(['image', 'video_clip', 'thumbnail']);

export function isVisualAsset(asset: MediaAsset): boolean {
  return VISUAL_TYPES.has(asset.type);
}

/**
 * True for the Demo Mode placeholder providers.
 *
 * Matched on the descriptor *name* rather than an exact string, because that is
 * what is actually stored on the asset — `Simulated (Demo Mode)`. An equality
 * check against `'simulated'` silently matched nothing, which made every
 * simulated-asset guard in the pipeline a no-op.
 */
export function isSimulatedProvider(provider: string): boolean {
  return /simulated/i.test(provider);
}

/** Provenance that stops a video being approved for publishing. */
export function isBlocking(provenance: Provenance): boolean {
  return provenance === 'unresolved';
}

/** Provenance that needs a person to look before publishing. */
export function needsManualReview(provenance: Provenance): boolean {
  return provenance === 'fair_use_review_required';
}

/**
 * Intellectual property that must never be assumed cleared.
 *
 * A documentary *about* a franchise is ordinary commentary and is not the
 * problem. Reusing the franchise's own artwork, card scans, screenshots or
 * broadcast footage is a different act, and no amount of a model saying "this
 * is probably fair use" makes it a decision the software should take.
 *
 * So anything matching these is classified `fair_use_review_required`: the
 * pipeline continues, the asset is flagged, and a person decides. The system
 * never claims the result is legally safe.
 */
const PROTECTED_IP =
  /\b(pok[eé]mon|nintendo|game freak|the pok[eé]mon company|tpci?|charizard|pikachu|porygon|yu-?gi-?oh|digimon|disney|marvel|nintendo switch|game boy)\b/i;

const PROTECTED_MEDIA =
  /\b(official artwork|card scan|screenshot|screen grab|anime (?:clip|footage|still)|episode still|promotional (?:art|material)|box art|logo|key art|game footage|gameplay)\b/i;

/**
 * Classifies one asset from what was actually recorded about it.
 *
 * Reads only stored fields — provider, metadata, generation prompt. It never
 * infers from a filename and never asks a model. An asset that arrived with no
 * licence information is `unresolved`, which is the truth and which blocks.
 */
export function classifyAsset(asset: MediaAsset): ProvenanceRecord {
  const metadata = (asset.metadata ?? {}) as Record<string, unknown>;
  const text = (value: unknown): string | null =>
    typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;

  const declared = text(metadata.provenance);
  const licence = text(metadata.licence);
  const creator = text(metadata.creator);
  const source = text(metadata.source) ?? text(metadata.landing_page);
  const attribution = text(metadata.attribution);
  const prompt = asset.generation_prompt ?? '';

  const base = {
    assetId: asset.id,
    provider: asset.provider,
    source,
    creator,
    licence,
    attribution,
    attributionRequired: metadata.attribution_required === true,
    retrievedAt: asset.created_at ?? null,
    restrictions: restrictionsFrom(licence),
  };

  // A simulated asset has no provenance to speak of, and must never reach a
  // production video. Quality control fails on it separately; here it is
  // simply unresolved, because nothing real produced it.
  if (isSimulatedProvider(asset.provider)) {
    return {
      ...base,
      provenance: 'unresolved',
      reason: 'Produced by the simulated provider. It is placeholder media, not a licensed asset.',
    };
  }

  // Generated originals still carry risk when the prompt asked for protected
  // property. "I generated it" is not a defence against having generated a
  // recognisable trademarked character.
  const generated = declared === 'generated_original' || prompt.length > 0;
  if (generated) {
    const named = PROTECTED_IP.exec(prompt)?.[0] ?? PROTECTED_IP.exec(String(metadata.revised_prompt ?? ''))?.[0];
    if (named) {
      return {
        ...base,
        provenance: 'fair_use_review_required',
        reason: `Generated from a prompt naming protected property ("${named}"). An original rendering of a trademarked character is still that character — a person must decide whether this use is defensible.`,
      };
    }
    return {
      ...base,
      provenance: 'generated_original',
      reason:
        'Generated original, subject to the image provider’s own terms. It copies no existing protected design that the prompt named.',
    };
  }

  if (declared === 'owner_uploaded') {
    return {
      ...base,
      provenance: 'owner_uploaded',
      reason:
        'Supplied by the account owner. Command Centre cannot verify the rights behind it — that responsibility stays with you.',
    };
  }

  if (declared === 'permitted_archive') {
    return {
      ...base,
      provenance: 'permitted_archive',
      reason: source
        ? `From an archive whose terms permit this use (${source}).`
        : 'Declared as a permitted archive source.',
    };
  }

  // Licensed material. The licence itself decides which bucket it lands in, and
  // material describing protected media still gets flagged whatever its licence
  // says, because a permissive licence on someone's photograph of a card does
  // not license the card.
  if (licence) {
    const description = `${text(metadata.search_query) ?? ''} ${text(metadata.attribution) ?? ''}`;
    if (PROTECTED_MEDIA.test(description) || PROTECTED_IP.test(description)) {
      return {
        ...base,
        provenance: 'fair_use_review_required',
        reason: `Licensed, but the material itself depicts protected property. The licence covers the photograph, not what it is a photograph of.`,
      };
    }
    const publicDomain = /^(cc0|pdm|public domain)/i.test(licence);
    return {
      ...base,
      provenance: publicDomain ? 'public_domain' : 'licensed_stock',
      reason: publicDomain
        ? `Public domain (${licence}).`
        : `Licensed under ${licence}${creator ? ` by ${creator}` : ''}.`,
    };
  }

  return {
    ...base,
    provenance: 'unresolved',
    reason:
      'No licence, source or generation record was stored for this asset, so nobody can say what it is or where it came from.',
  };
}

function restrictionsFrom(licence: string | null): string[] {
  if (!licence) return [];
  const normalised = licence.toLowerCase();
  const out: string[] = [];
  if (normalised.includes('nc')) out.push('Non-commercial only — not usable on a monetised channel.');
  if (normalised.includes('nd')) out.push('No derivatives — the asset may not be cropped, edited or overlaid.');
  if (normalised.includes('sa')) out.push('Share-alike — derivative works must carry the same licence.');
  return out;
}

export interface ProvenanceSummary {
  records: ProvenanceRecord[];
  blocking: ProvenanceRecord[];
  manualReview: ProvenanceRecord[];
  attributions: string[];
  counts: Record<Provenance, number>;
}

export function summariseProvenance(assets: MediaAsset[]): ProvenanceSummary {
  const records = assets.filter(isVisualAsset).map(classifyAsset);
  const counts = Object.fromEntries(PROVENANCE.map((key) => [key, 0])) as Record<
    Provenance,
    number
  >;
  for (const record of records) counts[record.provenance] += 1;

  return {
    records,
    blocking: records.filter((record) => isBlocking(record.provenance)),
    manualReview: records.filter((record) => needsManualReview(record.provenance)),
    // Every credit line that must appear in the description, de-duplicated.
    attributions: [
      ...new Set(
        records
          .filter((record) => record.attributionRequired && record.attribution)
          .map((record) => record.attribution!),
      ),
    ],
    counts,
  };
}
