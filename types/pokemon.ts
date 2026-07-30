import type { UUID } from './domain';

/**
 * Pokémon content research.
 *
 * One table rather than three, because all three kinds of work the researcher
 * does produce the same thing: an *opportunity* the operator can act on. A
 * YouTube idea, a TCG topic and an Etsy concept differ only in which
 * specialisation fields are filled in, and keeping them together means the
 * operator sees one ranked list instead of three.
 */

export const POKEMON_KINDS = ['youtube', 'tcg', 'etsy'] as const;
export type PokemonKind = (typeof POKEMON_KINDS)[number];

/**
 * What the opportunity is about. Broad enough to cover the whole subject and
 * narrow enough that two ideas in the same category are genuinely comparable.
 */
export const POKEMON_CATEGORIES = [
  'lore',
  'mystery',
  'character_history',
  'region',
  'legendary',
  'obscure_facts',
  'game_history',
  'anime_history',
  'tcg_history',
  'unusual_cards',
  'card_sets',
  'collecting',
  'competitive_history',
  'controversy',
  'forgotten',
  'ranking',
  'retrospective',
] as const;
export type PokemonCategory = (typeof POKEMON_CATEGORIES)[number];

/**
 * Whether the opportunity keeps its value.
 *
 * Kept explicit rather than inferred: a retrospective is worth making at any
 * time, and a topic riding a current wave is worth making this month or not at
 * all. Those are different decisions and the operator should not have to guess
 * which one they are looking at.
 */
export const CONTENT_LIFESPANS = ['evergreen', 'trend_driven'] as const;
export type ContentLifespan = (typeof CONTENT_LIFESPANS)[number];

/**
 * Intellectual-property risk in an Etsy product concept.
 *
 * `none` is for a concept that touches no protected material at all. `blocked`
 * means the concept cannot proceed as described — it reproduces artwork,
 * characters or branding we have no licence to sell. The levels between are
 * degrees of "a person needs to look at this", not degrees of permission.
 *
 * Researching demand for a franchise is legitimate. Selling its artwork is a
 * different question, and this enum is where the two are kept apart.
 */
export const IP_RISK_LEVELS = ['none', 'low', 'medium', 'high', 'blocked'] as const;
export type IpRisk = (typeof IP_RISK_LEVELS)[number];

/** Ranked worst-first, so the highest risk in a set is easy to find. */
export const IP_RISK_ORDER: Record<IpRisk, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
  blocked: 4,
};

export interface PokemonOpportunity {
  id: UUID;
  owner_id: UUID;
  business_id: UUID | null;
  mission_id: UUID | null;
  task_id: UUID | null;
  kind: PokemonKind;

  /** The working title, not a final one. */
  title_concept: string;
  /** The first line — what earns the next thirty seconds. */
  hook: string;
  category: PokemonCategory;
  /** Why a person would choose this over the other thing in their feed. */
  why_watch: string;
  target_audience: string;
  suggested_minutes: number;
  /** What has to be established before a word is written. */
  research_required: string[];
  /** The researcher's own confidence in the assessment, 0–1. */
  confidence: number;
  lifespan: ContentLifespan;

  /* --- TCG specialisation --------------------------------------- */
  /** Which part of the card game this is about: a set, a rarity system, a era. */
  tcg_focus: string | null;
  /**
   * True when answering this properly needs data we do not hold — current
   * prices, current market movement, what is trending right now.
   */
  requires_live_data: boolean;
  /** Exactly what would have to be connected, in plain words. */
  live_data_needed: string[];

  /* --- Etsy specialisation -------------------------------------- */
  ip_risk: IpRisk | null;
  /** What specifically is protected, named rather than gestured at. */
  ip_concerns: string[];
  /** An original direction that keeps the demand and drops the protected part. */
  safe_direction: string | null;

  sources: string[];
  notes: string;
  status: 'proposed' | 'approved' | 'rejected';
  /** True when this came from the simulated provider rather than a real model. */
  is_demo: boolean;
  created_at: string;
}
