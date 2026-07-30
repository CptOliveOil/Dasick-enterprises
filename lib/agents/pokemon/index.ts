import type { CapabilityHandler } from '@/lib/agents/capabilities';
import {
  pokemonEtsyOpportunities,
  pokemonIdeas,
  pokemonTcgResearch,
} from './research';

/**
 * Pokémon capabilities. Registered with the same registry as everything else
 * and executed by lib/agents/engine.ts — there is no separate path for them.
 *
 * The namespace is the extension point. A later Pokémon Card Analyst would add
 * `pokemon.card.*`, a Trend Scout `pokemon.trends.*`, an Etsy Product Researcher
 * `pokemon.product.*` — each a handler in this folder appended to the array
 * below, each picked up by an agent that declares the capability, and each
 * reachable from the router by the same route table. None of that requires
 * touching the engine, the workflows or the galaxy, which is the point of
 * keeping this agent's work inside its own namespace from the start.
 */
export const POKEMON_HANDLERS: CapabilityHandler<never>[] = [
  pokemonIdeas,
  pokemonTcgResearch,
  pokemonEtsyOpportunities,
] as unknown as CapabilityHandler<never>[];

export { pokemonIdeas, pokemonTcgResearch, pokemonEtsyOpportunities };
