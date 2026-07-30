import { uuid } from '@/lib/ids';
import type { CapabilityHandler, PersistResult } from '@/lib/agents/capabilities';
import type { RunContext } from '@/lib/agents/context';
import {
  assessIpRisk,
  highestRisk,
  liveDataNeeds,
  needsIpReview,
} from '@/lib/pokemon/policy';
import {
  pokemonEtsyResponseSchema,
  pokemonIdeasResponseSchema,
  pokemonTcgResponseSchema,
} from '@/schemas/pokemon';
import type { PokemonOpportunity } from '@/types/pokemon';
import {
  basePokemonContext,
  IP_SEPARATION,
  isSimulated,
  NO_INVENTED_MARKET_DATA,
  NUMBER_HONESTY,
  opportunityText,
  simulatedSuffix,
} from './shared';

const now = () => new Date().toISOString();

/** Fields every opportunity row shares, whatever kind it is. */
function baseRow(
  ctx: RunContext,
  kind: PokemonOpportunity['kind'],
): Pick<
  PokemonOpportunity,
  | 'owner_id'
  | 'business_id'
  | 'mission_id'
  | 'task_id'
  | 'kind'
  | 'status'
  | 'is_demo'
  | 'created_at'
> {
  return {
    owner_id: ctx.ownerId,
    business_id: ctx.business?.id ?? ctx.task.business_id ?? null,
    mission_id: ctx.task.mission_id,
    task_id: ctx.task.id,
    kind,
    status: 'proposed',
    is_demo: isSimulated(ctx),
    created_at: now(),
  };
}

/** How many opportunities to produce, bounded so a typo cannot ask for 900. */
function count(ctx: RunContext, fallback: number): number {
  const raw = Number(ctx.task.input.count ?? fallback);
  return Number.isFinite(raw) && raw >= 1 && raw <= 25 ? Math.floor(raw) : fallback;
}

function subjectOf(ctx: RunContext): string {
  const explicit = ctx.task.input.subject ?? ctx.task.input.instructions;
  return typeof explicit === 'string' && explicit.trim().length > 0
    ? explicit.trim()
    : ctx.task.description || ctx.task.title;
}

/**
 * The part of an opportunity a downstream agent needs.
 *
 * A step's `output` is JSON-rendered straight into the next agent's prompt, so
 * a handoff that carried only row ids would hand the Scriptwriter nothing it
 * could write from — it cannot read the table. This carries the substance and
 * leaves out the bookkeeping.
 */
function handoffShape(row: PokemonOpportunity) {
  return {
    id: row.id,
    title_concept: row.title_concept,
    hook: row.hook,
    category: row.category,
    why_watch: row.why_watch,
    target_audience: row.target_audience,
    suggested_minutes: row.suggested_minutes,
    research_required: row.research_required,
    lifespan: row.lifespan,
    ...(row.tcg_focus ? { tcg_focus: row.tcg_focus } : {}),
    ...(row.requires_live_data ? { live_data_needed: row.live_data_needed } : {}),
  };
}

/** Ten is plenty for a prompt, and keeps the rendered JSON well inside its cap. */
const HANDOFF_LIMIT = 10;

/* ------------------------------------------------------------------ */
/* pokemon.research.ideas                                              */
/* ------------------------------------------------------------------ */

export const pokemonIdeas: CapabilityHandler<
  ReturnType<typeof pokemonIdeasResponseSchema.parse>
> = {
  capability: 'pokemon.research.ideas',
  label: 'Pokémon content opportunities',
  schemaName: 'PokemonIdeas',
  schema: pokemonIdeasResponseSchema,

  async buildPrompt(ctx) {
    const wanted = count(ctx, 10);
    return [
      await basePokemonContext(ctx),
      '',
      `Find ${wanted} distinct Pokémon content opportunities for a faceless YouTube channel.`,
      `Subject or angle requested: ${subjectOf(ctx)}`,
      '',
      'The subject is wide on purpose. Draw from lore, unexplained details and mysteries,',
      'character and regional histories, legendary Pokémon, obscure facts, the history of the',
      'games, the history of the anime, the trading card game and its odd corners, collecting',
      'stories, competitive history, controversies, Pokémon everyone has forgotten, rankings',
      'and retrospectives. Range across these rather than producing ten of one.',
      '',
      NO_INVENTED_MARKET_DATA,
      '',
      NUMBER_HONESTY,
      '',
      'For each opportunity:',
      '- `title_concept`: a working title. Specific beats clever.',
      '- `hook`: the actual opening line, written as it would be spoken.',
      '- `why_watch`: why a person picks this over the next thing in their feed. Not a summary.',
      '- `target_audience`: who specifically — "people who played Red and Blue as children" is',
      '  useful, "Pokémon fans" is not.',
      '- `suggested_minutes`: what the subject genuinely supports, not what you wish it did.',
      '- `research_required`: what must be established before a word is written. Be concrete.',
      '- `confidence`: your own confidence in this assessment, 0 to 1.',
      '',
      'Every idea must be genuinely distinct, not a rephrasing of another.',
    ]
      .filter((part) => part.trim().length > 0)
      .join('\n');
  },

  async persist(ctx, data) {
    const rows: PokemonOpportunity[] = data.ideas.map((idea) => {
      // A "top ten most valuable cards" idea is a perfectly good video that
      // cannot be made honestly without a price source. Flagging it here means
      // the operator learns that now rather than after the script is written.
      const needs = liveDataNeeds(
        opportunityText([idea.title_concept, idea.hook, idea.why_watch, idea.notes, idea.research_required]),
      );
      return {
        id: uuid(),
        ...baseRow(ctx, 'youtube'),
        title_concept: idea.title_concept,
        hook: idea.hook,
        category: idea.category,
        why_watch: idea.why_watch,
        target_audience: idea.target_audience,
        suggested_minutes: idea.suggested_minutes,
        research_required: idea.research_required,
        confidence: idea.confidence,
        lifespan: idea.lifespan,
        tcg_focus: null,
        requires_live_data: needs.length > 0,
        live_data_needed: needs,
        ip_risk: null,
        ip_concerns: [],
        safe_direction: null,
        sources: idea.sources,
        notes: [idea.notes, data.self_assessment].filter(Boolean).join('\n\n'),
      };
    });

    await ctx.store.insertMany('pokemon_opportunities', rows);

    const gated = rows.filter((row) => row.requires_live_data).length;
    return {
      summary:
        `found ${rows.length} Pokémon video ${rows.length === 1 ? 'opportunity' : 'opportunities'}` +
        (gated > 0 ? `, ${gated} needing a live data source first` : '') +
        simulatedSuffix(ctx),
      output: {
        opportunity_ids: rows.map((r) => r.id),
        count: rows.length,
        subject: data.subject,
        needs_live_data: gated,
        simulated: isSimulated(ctx),
        // The first is the one a downstream Scriptwriter should write, by the
        // same convention the YouTube pipeline already uses for ideas.
        selected: rows[0] ? handoffShape(rows[0]) : null,
        opportunities: rows.slice(0, HANDOFF_LIMIT).map(handoffShape),
      },
    };
  },
};

/* ------------------------------------------------------------------ */
/* pokemon.tcg.research                                                */
/* ------------------------------------------------------------------ */

export const pokemonTcgResearch: CapabilityHandler<
  ReturnType<typeof pokemonTcgResponseSchema.parse>
> = {
  capability: 'pokemon.tcg.research',
  label: 'Pokémon TCG research',
  schemaName: 'PokemonTcgResearch',
  schema: pokemonTcgResponseSchema,

  async buildPrompt(ctx) {
    const wanted = count(ctx, 8);
    return [
      await basePokemonContext(ctx),
      '',
      `Research ${wanted} Pokémon trading card topics that could carry a video.`,
      `Subject or angle requested: ${subjectOf(ctx)}`,
      '',
      'Work from the history and the stories, not the market. Good ground: how sets were',
      'designed and released, how rarity systems worked and changed, cards that are notable',
      'for what happened around them, printing and distribution oddities, the culture of',
      'collecting, how the game mechanics evolved, and set retrospectives.',
      '',
      NO_INVENTED_MARKET_DATA,
      '',
      NUMBER_HONESTY,
      '',
      'For each topic also give `tcg_focus` — the specific set, era, rarity system or print',
      'run it centres on — and set `needs_market_data` honestly.',
    ]
      .filter((part) => part.trim().length > 0)
      .join('\n');
  },

  async persist(ctx, data) {
    const rows: PokemonOpportunity[] = data.topics.map((topic) => {
      // The model's own `needs_market_data` is taken as a hint and then checked
      // against the text, because the case worth catching is the one where it
      // said no and then quoted a price anyway.
      const needs = liveDataNeeds(
        opportunityText([
          topic.title_concept,
          topic.hook,
          topic.why_watch,
          topic.tcg_focus,
          topic.notes,
          topic.research_required,
        ]),
      );
      const requiresLive = needs.length > 0 || topic.needs_market_data;
      return {
        id: uuid(),
        ...baseRow(ctx, 'tcg'),
        title_concept: topic.title_concept,
        hook: topic.hook,
        category: topic.category,
        why_watch: topic.why_watch,
        target_audience: topic.target_audience,
        suggested_minutes: topic.suggested_minutes,
        research_required: topic.research_required,
        confidence: topic.confidence,
        lifespan: topic.lifespan,
        tcg_focus: topic.tcg_focus,
        requires_live_data: requiresLive,
        live_data_needed:
          needs.length > 0
            ? needs
            : requiresLive
              ? ['a live card-pricing or market source before this topic can be stated as fact']
              : [],
        ip_risk: null,
        ip_concerns: [],
        safe_direction: null,
        sources: topic.sources,
        notes: [topic.notes, data.self_assessment].filter(Boolean).join('\n\n'),
      };
    });

    await ctx.store.insertMany('pokemon_opportunities', rows);

    const gated = rows.filter((row) => row.requires_live_data).length;
    return {
      summary:
        `researched ${rows.length} Pokémon card ${rows.length === 1 ? 'topic' : 'topics'}` +
        (gated > 0
          ? `, ${gated} of which cannot be stated as fact without a live pricing source`
          : '') +
        simulatedSuffix(ctx),
      output: {
        opportunity_ids: rows.map((r) => r.id),
        count: rows.length,
        subject: data.subject,
        needs_live_data: gated,
        simulated: isSimulated(ctx),
        selected: rows[0] ? handoffShape(rows[0]) : null,
        opportunities: rows.slice(0, HANDOFF_LIMIT).map(handoffShape),
      },
    };
  },
};

/* ------------------------------------------------------------------ */
/* pokemon.etsy.opportunities                                          */
/* ------------------------------------------------------------------ */

export const pokemonEtsyOpportunities: CapabilityHandler<
  ReturnType<typeof pokemonEtsyResponseSchema.parse>
> = {
  capability: 'pokemon.etsy.opportunities',
  label: 'Pokémon product demand research',
  schemaName: 'PokemonEtsyOpportunities',
  schema: pokemonEtsyResponseSchema,

  async buildPrompt(ctx) {
    const wanted = count(ctx, 6);
    return [
      await basePokemonContext(ctx),
      '',
      `Research ${wanted} Pokémon-related product opportunities.`,
      `Subject or angle requested: ${subjectOf(ctx)}`,
      '',
      IP_SEPARATION,
      '',
      NO_INVENTED_MARKET_DATA,
      '',
      NUMBER_HONESTY,
      '',
      'For each opportunity:',
      '- `demand_signal`: what tells you people want this. Describe it; do not invent a number.',
      '- `product_concept`: what the product actually is, in enough detail to be judged.',
      '- `depicts`: precisely what would appear on it. This is the field a person reads when',
      '  deciding whether we may sell it, so be exact even when the answer is awkward.',
      '- `claimed_ip_risk`: your own honest view. It will be checked independently.',
    ]
      .filter((part) => part.trim().length > 0)
      .join('\n');
  },

  async persist(ctx, data): Promise<PersistResult> {
    const rows: PokemonOpportunity[] = data.concepts.map((concept) => {
      // The recorded risk is recomputed from the concept text rather than taken
      // from `claimed_ip_risk`. The whole reason for the check is the case where
      // the model called a character print low-risk.
      const assessment = assessIpRisk(
        opportunityText([
          concept.title_concept,
          concept.product_concept,
          concept.depicts,
          concept.notes,
        ]),
      );
      const needs = liveDataNeeds(
        opportunityText([concept.demand_signal, concept.why_watch, concept.notes]),
      );
      return {
        id: uuid(),
        ...baseRow(ctx, 'etsy'),
        title_concept: concept.title_concept,
        hook: concept.hook,
        category: concept.category,
        why_watch: concept.why_watch,
        target_audience: concept.target_audience,
        suggested_minutes: concept.suggested_minutes,
        research_required: concept.research_required,
        confidence: concept.confidence,
        lifespan: concept.lifespan,
        tcg_focus: null,
        requires_live_data: needs.length > 0,
        live_data_needed: needs,
        ip_risk: assessment.risk,
        ip_concerns: assessment.concerns,
        safe_direction: assessment.safe_direction,
        sources: concept.sources,
        notes: [
          `Demand signal: ${concept.demand_signal}`,
          `Product concept: ${concept.product_concept}`,
          concept.depicts ? `Depicts: ${concept.depicts}` : '',
          concept.notes,
          data.self_assessment,
        ]
          .filter(Boolean)
          .join('\n\n'),
      };
    });

    await ctx.store.insertMany('pokemon_opportunities', rows);

    const flagged = rows.filter((row) => row.ip_risk && needsIpReview(row.ip_risk));
    const worst = highestRisk(rows.map((row) => row.ip_risk ?? 'none'));

    const result: PersistResult = {
      summary:
        `researched ${rows.length} Pokémon product ${rows.length === 1 ? 'opportunity' : 'opportunities'}` +
        (flagged.length > 0
          ? `, ${flagged.length} flagged for intellectual-property risk`
          : '') +
        simulatedSuffix(ctx),
      output: {
        opportunity_ids: rows.map((r) => r.id),
        count: rows.length,
        subject: data.subject,
        highest_ip_risk: worst,
        flagged_ip: flagged.length,
        simulated: isSimulated(ctx),
      },
    };

    // Demand research is research and needs no gate. A product concept that
    // would reproduce someone else's artwork is a different thing, and it stops
    // here for a person rather than flowing on into a listing.
    if (flagged.length > 0) {
      result.approval = {
        kind: 'product',
        title: `Intellectual-property risk: ${flagged.length} Pokémon product ${flagged.length === 1 ? 'concept' : 'concepts'}`,
        summary:
          `${flagged.length} of ${rows.length} concepts would use material we hold no licence for. ` +
          'The demand behind them is real; the products as described are not ours to sell. ' +
          'Each one names what is protected and an original direction that keeps the buyer and drops the risk.',
        payload: {
          opportunity_ids: flagged.map((row) => row.id),
          highest_ip_risk: worst,
          concepts: flagged.map((row) => ({
            id: row.id,
            title: row.title_concept,
            ip_risk: row.ip_risk,
            concerns: row.ip_concerns,
            safe_direction: row.safe_direction,
          })),
        },
      };
    }

    return result;
  },
};
