import { z } from 'zod';
import {
  CONTENT_LIFESPANS,
  IP_RISK_LEVELS,
  POKEMON_CATEGORIES,
} from '@/types/pokemon';

/**
 * Structured output for the Pokémon Researcher.
 *
 * The same two habits as the Islamic schemas, for the same reasons. Fields the
 * model might not reliably know are **nullable rather than optional**, so there
 * is an explicit, legitimate way to say "I do not know this" instead of an
 * invented value that looks complete. And the judgements that matter —
 * lifespan, IP risk — are **enums with no way to omit them**, so an opportunity
 * cannot arrive without the model having committed to an answer.
 *
 * The IP risk the model reports here is only an opinion. The recorded risk is
 * recomputed from the concept text in lib/pokemon/policy.ts, because the point
 * of the check is to catch the case where the model got it wrong.
 */

const category = z.enum(POKEMON_CATEGORIES);
const lifespan = z.enum(CONTENT_LIFESPANS);
const ipRisk = z.enum(IP_RISK_LEVELS);

/** The nine things the operator asked to see for every opportunity. */
const opportunityCore = {
  title_concept: z.string().min(4),
  hook: z.string().min(8),
  category,
  why_watch: z.string().min(8),
  target_audience: z.string().min(3),
  suggested_minutes: z.number().int().min(1).max(180),
  research_required: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1),
  lifespan,
  sources: z.array(z.string()).default([]),
  notes: z.string().default(''),
};

export const pokemonIdeaSchema = z.object(opportunityCore);

export const pokemonIdeasResponseSchema = z.object({
  subject: z.string().min(2),
  ideas: z.array(pokemonIdeaSchema).min(1),
  /** Honest self-assessment of the batch. */
  self_assessment: z.string().default(''),
});

export const pokemonTcgTopicSchema = z.object({
  ...opportunityCore,
  /** Which part of the card game: a set, an era, a rarity system, a print run. */
  tcg_focus: z.string().min(2),
  /**
   * The model's own view of whether this needs live market data. Recomputed
   * from the text regardless — this only helps when the model is right.
   */
  needs_market_data: z.boolean(),
});

export const pokemonTcgResponseSchema = z.object({
  subject: z.string().min(2),
  topics: z.array(pokemonTcgTopicSchema).min(1),
  self_assessment: z.string().default(''),
});

export const pokemonEtsyConceptSchema = z.object({
  ...opportunityCore,
  /** The demand signal, described rather than quantified. */
  demand_signal: z.string().min(4),
  /** What the product would actually be, in enough detail to assess. */
  product_concept: z.string().min(8),
  /** What it would depict or reproduce. The field the IP check reads most. */
  depicts: z.string().default(''),
  /** The model's own view. Recomputed from the text regardless. */
  claimed_ip_risk: ipRisk,
});

export const pokemonEtsyResponseSchema = z.object({
  subject: z.string().min(2),
  concepts: z.array(pokemonEtsyConceptSchema).min(1),
  self_assessment: z.string().default(''),
});

export type PokemonIdeasResponse = z.infer<typeof pokemonIdeasResponseSchema>;
export type PokemonTcgResponse = z.infer<typeof pokemonTcgResponseSchema>;
export type PokemonEtsyResponse = z.infer<typeof pokemonEtsyResponseSchema>;
