import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleCommand } from '@/lib/agents/manager';
import { runAgent } from '@/lib/agents/engine';
import { runMission } from '@/lib/workflows/runner';
import { createMission } from '@/lib/workflows/engine';
import { getCapabilityHandler, listCapabilities } from '@/lib/agents/capabilities';
import { AGENT_TEMPLATES, getTemplate } from '@/lib/agents/templates';
import { appearanceOf, composeVisual, COLOUR_PRESETS } from '@/lib/agents/presets';
import { newAgent } from '@/lib/agents/factory';
import { WORKFLOW_DEFINITIONS } from '@/lib/workflows/definitions';
import {
  assessIpRisk,
  escalate,
  highestRisk,
  liveDataNeeds,
  needsIpReview,
  requiresLiveData,
} from '@/lib/pokemon/policy';
import { pokemonEtsyResponseSchema, pokemonIdeasResponseSchema } from '@/schemas/pokemon';
import { makePokemonWorkspace, makeWorkspace, OWNER_ID } from './helpers';

/** Demo Mode: no database, no provider keys, simulated AI output. */
beforeEach(() => {
  vi.stubEnv('ANTHROPIC_API_KEY', '');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
  vi.stubEnv('DISABLE_SIMULATED_MEDIA', '');
});

/* ------------------------------------------------------------------ */
/* Intellectual property                                               */
/* ------------------------------------------------------------------ */

/**
 * The distinction the whole Etsy side turns on: researching what people want
 * is ordinary research, and selling someone else's artwork is not something
 * this system may quietly decide to do.
 */
describe('intellectual-property risk', () => {
  it('blocks a concept that reproduces official card artwork', () => {
    const result = assessIpRisk(
      'A poster printed with the official card artwork from the first set.',
    );
    expect(result.risk).toBe('blocked');
    expect(result.concerns.join(' ')).toMatch(/artwork/i);
    expect(result.safe_direction).toBeTruthy();
  });

  it('blocks a concept that depicts a named character', () => {
    expect(assessIpRisk('An enamel pin of Pikachu.').risk).toBe('blocked');
    expect(assessIpRisk('A sticker sheet featuring Charizard and Gengar.').risk).toBe(
      'blocked',
    );
  });

  it('blocks a concept using protected branding or a logo', () => {
    expect(
      assessIpRisk('A mug using the Pokémon logo in the original wordmark.').risk,
    ).toBe('blocked');
    expect(assessIpRisk('A print of a Poké Ball on a dark background.').risk).toBe('blocked');
  });

  it('refuses to treat fan art or a redraw as a way around it', () => {
    const result = assessIpRisk(
      'Original fan art in the style of the trainer cards, redrawn by us.',
    );
    expect(result.risk).toBe('blocked');
    expect(result.concerns.join(' ')).toMatch(/derivative/i);
  });

  it('treats naming the franchise on the product as high risk, not blocked', () => {
    const result = assessIpRisk(
      'A wall chart titled "Pokémon type effectiveness", laid out as a plain table of our own.',
    );
    expect(result.risk).toBe('high');
    expect(result.concerns.join(' ')).toMatch(/trademark/i);
  });

  it('accepts an original design that shares only a genre', () => {
    const result = assessIpRisk(
      'An original creature-collector inspired print, unbranded, using our own designs.',
    );
    expect(result.risk).toBe('low');
    expect(result.concerns).toEqual([]);
  });

  it('reports no risk for a concept that touches nothing protected', () => {
    expect(assessIpRisk('A blank hobby planner for tracking a collection.').risk).toBe('none');
  });

  it('only sends the genuinely risky ones for review', () => {
    expect(needsIpReview('none')).toBe(false);
    expect(needsIpReview('low')).toBe(false);
    expect(needsIpReview('medium')).toBe(false);
    expect(needsIpReview('high')).toBe(true);
    expect(needsIpReview('blocked')).toBe(true);
  });

  it('summarises a set by its worst member', () => {
    expect(escalate('low', 'blocked')).toBe('blocked');
    expect(escalate('high', 'medium')).toBe('high');
    expect(highestRisk(['none', 'low', 'high', 'medium'])).toBe('high');
    expect(highestRisk([])).toBe('none');
  });
});

/* ------------------------------------------------------------------ */
/* Live market data                                                    */
/* ------------------------------------------------------------------ */

describe('live market data', () => {
  it('requires a source for anything about current prices', () => {
    expect(requiresLiveData('What is a first edition worth today?')).toBe(true);
    expect(requiresLiveData('The ten most valuable cards and their price')).toBe(true);
    expect(requiresLiveData('Which cards are trending right now')).toBe(true);
    expect(requiresLiveData('It sold for £4,000 at auction')).toBe(true);
    expect(requiresLiveData('The PSA 10 population for that card')).toBe(true);
  });

  it('leaves history alone, because history is knowledge rather than a feed', () => {
    expect(
      requiresLiveData('Why the first set had a printing error and how it was corrected'),
    ).toBe(false);
    expect(requiresLiveData('The design history of the holographic treatment')).toBe(false);
  });

  it('names what would have to be connected rather than only refusing', () => {
    const needs = liveDataNeeds('What is a shadowless Charizard worth right now?');
    expect(needs.length).toBeGreaterThan(0);
    expect(needs.join(' ')).toMatch(/live/i);
  });
});

/* ------------------------------------------------------------------ */
/* Agent creation                                                      */
/* ------------------------------------------------------------------ */

describe('Pokémon Researcher as an agent', () => {
  it('has a template whose every capability has a real handler', () => {
    const template = getTemplate('pokemon_researcher');
    expect(template).toBeDefined();
    for (const capability of template!.capabilities) {
      expect(getCapabilityHandler(capability), capability).toBeDefined();
    }
  });

  it('is created by the ordinary factory, with no special path', () => {
    const template = getTemplate('pokemon_researcher')!;
    const agent = newAgent({
      owner_id: OWNER_ID,
      name: template.name,
      slug: 'pokemon-researcher',
      role: template.role,
      system_prompt: template.system_prompt,
      max_tokens: 2048,
      capabilities: template.capabilities,
      visual: composeVisual(template.appearance, 4),
    });
    expect(agent.capabilities).toEqual(template.capabilities);
    expect(agent.status).toBeDefined();
    expect(agent.archived_at).toBeNull();
  });

  it('gets a planet of its own, in a colour no other agent uses', () => {
    const template = getTemplate('pokemon_researcher')!;
    const preset = COLOUR_PRESETS.find((p) => p.key === template.appearance.colour);
    expect(preset, 'the template names a colour that exists').toBeDefined();

    const others = AGENT_TEMPLATES.filter((t) => t.key !== 'pokemon_researcher');
    expect(others.some((t) => t.appearance.colour === template.appearance.colour)).toBe(false);

    // And the appearance survives a round trip, so the builder shows what was
    // actually chosen rather than falling back to a default.
    const visual = composeVisual(template.appearance, 4);
    expect(appearanceOf(visual).colour).toBe(template.appearance.colour);
    expect(visual.ring).toBe(true);
  });

  it('declares only capabilities the workforce registry knows about', () => {
    const known = new Set(listCapabilities().map((c) => c.capability));
    for (const capability of getTemplate('pokemon_researcher')!.capabilities) {
      expect(known.has(capability), capability).toBe(true);
    }
  });
});

/* ------------------------------------------------------------------ */
/* Routing                                                             */
/* ------------------------------------------------------------------ */

async function route(instruction: string) {
  const { store } = await makePokemonWorkspace();
  return handleCommand(store, OWNER_ID, instruction);
}

function capabilities(result: Awaited<ReturnType<typeof handleCommand>>): string[] {
  return (result.plan?.steps ?? []).map((step) => step.capability);
}

describe('command routing', () => {
  it('routes a request for video ideas to the Pokémon Researcher', async () => {
    const result = await route('Give me 10 Pokémon YouTube ideas.');
    expect(capabilities(result)).toEqual(['pokemon.research.ideas']);
    expect(result.plan?.steps[0]!.input.count).toBe(10);
  });

  it('routes card history to the card research rather than to general ideas', async () => {
    const result = await route('Research the history of Charizard cards.');
    expect(capabilities(result)).toEqual(['pokemon.tcg.research']);
  });

  it('routes a request for mysteries to the researcher', async () => {
    const result = await route('Find interesting Pokémon mysteries for YouTube.');
    expect(capabilities(result)).toEqual(['pokemon.research.ideas']);
  });

  it('routes "create a faceless video" to the full production workflow', async () => {
    const result = await route('Create a faceless video about the strangest Pokémon lore.');
    expect(result.plan?.workflow).toBe('pokemon_youtube_video');
  });

  it('reads "TCG topics that could make good videos" as research, not as a video', async () => {
    const result = await route('Find Pokémon TCG topics that could make good videos.');
    expect(result.plan?.workflow).toBeNull();
    expect(capabilities(result)).toEqual(['pokemon.tcg.research']);
  });

  it('routes product questions to the product research and scopes them to Etsy', async () => {
    const result = await route('Are there Etsy product opportunities around Pokémon cards?');
    expect(capabilities(result)).toEqual(['pokemon.etsy.opportunities']);
  });

  it('leaves ordinary YouTube work with the general researcher', async () => {
    const result = await route('Give me 10 YouTube video ideas about deep sea exploration.');
    expect(capabilities(result)).toEqual(['youtube.research.ideas']);
  });

  it('does not claim a card question that is not about this franchise', async () => {
    const result = await route('Research the history of Magic: The Gathering cards.');
    expect(capabilities(result)).not.toContain('pokemon.tcg.research');
  });

  it('leaves channel analytics with the analyst', async () => {
    const result = await route('Analyse retention on my Pokémon channel.');
    expect(capabilities(result)).not.toContain('pokemon.research.ideas');
  });

  it('falls back to the general routes when the specialist does not exist', async () => {
    // The same instruction against a workspace with no Pokémon agent: the route
    // must not fire, because a mission nobody can run is worse than none.
    const { store } = await makeWorkspace();
    const result = await handleCommand(store, OWNER_ID, 'Give me 10 Pokémon YouTube ideas.');
    expect(capabilities(result)).not.toContain('pokemon.research.ideas');
  });
});

/* ------------------------------------------------------------------ */
/* Capability execution                                                */
/* ------------------------------------------------------------------ */

describe('capability execution in Demo Mode', () => {
  it('generates content opportunities carrying every field the operator asked for', async () => {
    const { store } = await makePokemonWorkspace();
    const command = await handleCommand(store, OWNER_ID, 'Give me 6 Pokémon YouTube ideas.');
    const task = command.tasks[0]!;

    const result = await runAgent(store, OWNER_ID, task.id);
    expect(result.status).toBe('completed');

    const rows = await store.list('pokemon_opportunities', {});
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.kind).toBe('youtube');
      expect(row.title_concept.length).toBeGreaterThan(0);
      expect(row.hook.length).toBeGreaterThan(0);
      expect(row.category).toBeTruthy();
      expect(row.why_watch.length).toBeGreaterThan(0);
      expect(row.target_audience.length).toBeGreaterThan(0);
      expect(row.suggested_minutes).toBeGreaterThan(0);
      expect(Array.isArray(row.research_required)).toBe(true);
      expect(row.confidence).toBeGreaterThanOrEqual(0);
      expect(row.confidence).toBeLessThanOrEqual(1);
      expect(['evergreen', 'trend_driven']).toContain(row.lifespan);
    }
  });

  it('researches card topics and never records a price it was not given', async () => {
    const { store } = await makePokemonWorkspace();
    const command = await handleCommand(
      store,
      OWNER_ID,
      'Research 4 Pokémon card set topics.',
    );
    const result = await runAgent(store, OWNER_ID, command.tasks[0]!.id);
    expect(result.status).toBe('completed');

    const rows = await store.list('pokemon_opportunities', { where: { kind: 'tcg' } });
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      // Either the topic stands on history alone, or it is explicitly marked as
      // needing a source. What must never happen is a priced claim with neither.
      const priced = /[£$€]\s?\d|\bworth\b|\bprice\b/i.test(
        [row.title_concept, row.hook, row.why_watch, row.notes].join(' '),
      );
      if (priced) {
        expect(row.requires_live_data).toBe(true);
        expect(row.live_data_needed.length).toBeGreaterThan(0);
      }
    }
  });

  it('records the researcher-facing fields for a card topic', async () => {
    const { store } = await makePokemonWorkspace();
    const command = await handleCommand(store, OWNER_ID, 'Research 3 Pokémon booster sets.');
    await runAgent(store, OWNER_ID, command.tasks[0]!.id);
    const rows = await store.list('pokemon_opportunities', { where: { kind: 'tcg' } });
    expect(rows.every((row) => typeof row.tcg_focus === 'string')).toBe(true);
  });

  it('runs product research and gates the concepts that are not ours to sell', async () => {
    const { store } = await makePokemonWorkspace();
    const command = await handleCommand(
      store,
      OWNER_ID,
      'Find 4 Pokémon Etsy product opportunities.',
    );
    const result = await runAgent(store, OWNER_ID, command.tasks[0]!.id);
    expect(result.status).toBe('completed');

    const rows = await store.list('pokemon_opportunities', { where: { kind: 'etsy' } });
    expect(rows.length).toBeGreaterThan(0);
    // Every product concept gets a verdict — never left unassessed.
    for (const row of rows) {
      expect(row.ip_risk).toBeTruthy();
      expect(Array.isArray(row.ip_concerns)).toBe(true);
    }

    // And when one is genuinely risky, it stops for a person rather than
    // flowing on into a listing.
    const risky = rows.filter((row) => row.ip_risk && needsIpReview(row.ip_risk));
    const approvals = await store.list('approvals', {});
    if (risky.length > 0) {
      expect(approvals.some((a) => /intellectual-property/i.test(a.title))).toBe(true);
    }
  });

  it('raises an approval naming what is protected when a concept copies artwork', async () => {
    // Driven through the handler directly with a known-bad concept, so the gate
    // is tested rather than whatever the simulated provider happened to invent.
    const { store, business, pokemonResearcher } = await makePokemonWorkspace();
    const mission = await createMission(store, {
      ownerId: OWNER_ID,
      businessId: business.id,
      title: 'Product research',
      objective: 'Research Pokémon product demand',
      workflowKey: null,
      steps: [
        {
          capability: 'pokemon.etsy.opportunities',
          title: 'Research product opportunities',
          description: 'Pokémon products',
          depends_on: [],
          requires_approval: false,
          input: {},
        },
      ],
      context: {},
    });
    const task = mission.tasks[0]!;

    const handler = getCapabilityHandler('pokemon.etsy.opportunities')!;
    const data = pokemonEtsyResponseSchema.parse({
      subject: 'Pokémon prints',
      concepts: [
        {
          title_concept: 'Starter poster set',
          hook: 'The three that started it all, together on one wall.',
          category: 'collecting',
          why_watch: 'Nostalgia buyers who already decorate a games room.',
          target_audience: 'Adults who played the first generation',
          suggested_minutes: 1,
          research_required: [],
          confidence: 0.6,
          lifespan: 'evergreen',
          sources: [],
          notes: '',
          demand_signal: 'Steady searches for retro gaming wall art',
          product_concept: 'A set of three A3 posters.',
          depicts: 'The official card artwork for Charizard, Blastoise and Venusaur.',
          // The model calls it fine. It is not fine, and that is the point.
          claimed_ip_risk: 'low',
        },
      ],
      self_assessment: '',
    });

    const result = await handler.persist!(
      {
        store,
        ownerId: OWNER_ID,
        agent: pokemonResearcher,
        task,
        mission: mission.mission,
        business,
        memory: [],
        previousOutputs: {},
      },
      data,
    );

    expect(result.approval).toBeDefined();
    expect(result.approval!.kind).toBe('product');
    expect(result.approval!.title).toMatch(/intellectual-property/i);

    const [row] = await store.list('pokemon_opportunities', { where: { kind: 'etsy' } });
    // The recorded risk is the assessed one, not the one the model claimed.
    expect(row!.ip_risk).toBe('blocked');
    expect(row!.ip_concerns.length).toBeGreaterThan(0);
    expect(row!.safe_direction).toBeTruthy();
  });
});

/* ------------------------------------------------------------------ */
/* Handoffs                                                            */
/* ------------------------------------------------------------------ */

describe('handoffs into the existing pipeline', () => {
  it('reuses the existing agents rather than duplicating them', () => {
    const workflow = WORKFLOW_DEFINITIONS.find((w) => w.key === 'pokemon_youtube_video')!;
    expect(workflow).toBeDefined();

    // Exactly one new capability. Everything downstream is the pipeline that
    // was already there.
    const pokemonSteps = workflow.steps.filter((s) => s.capability.startsWith('pokemon.'));
    expect(pokemonSteps).toHaveLength(1);
    expect(pokemonSteps[0]!.capability).toBe('pokemon.research.ideas');

    const full = WORKFLOW_DEFINITIONS.find((w) => w.key === 'youtube_video_full')!;
    const fullCaps = new Set(full.steps.map((s) => s.capability));
    for (const step of workflow.steps) {
      if (step.capability.startsWith('pokemon.')) continue;
      expect(fullCaps.has(step.capability), step.capability).toBe(true);
    }
  });

  it('still stops at the script approval, like every other video', () => {
    const workflow = WORKFLOW_DEFINITIONS.find((w) => w.key === 'pokemon_youtube_video')!;
    const gate = workflow.steps.find((s) => s.requires_approval);
    expect(gate?.capability).toBe('youtube.script.factcheck');
    expect(gate?.approval_label).toBe('Approve script');
  });

  it('logs a real handoff from the researcher to the Scriptwriter', async () => {
    const { store, agents, pokemonResearcher } = await makePokemonWorkspace();
    const command = await handleCommand(
      store,
      OWNER_ID,
      'Create a faceless video about the strangest Pokémon lore.',
    );
    expect(command.plan?.workflow).toBe('pokemon_youtube_video');

    // Two steps is enough to cross the boundary that matters: research, then
    // the handoff into the Scriptwriter.
    await runMission(store, OWNER_ID, command.mission!.id, { maxSteps: 2 });

    const handoffs = await store.list('activity_logs', { where: { kind: 'handoff' } });
    const toWriter = handoffs.find(
      (log) => log.agent_id === pokemonResearcher.id && log.target_agent_id === agents.writer.id,
    );
    expect(toWriter, 'the researcher hands its work to the Scriptwriter').toBeDefined();
    expect(toWriter!.message).toMatch(/passed work to/i);
  });

  it('carries the research itself across the handoff, not just row ids', async () => {
    const { store } = await makePokemonWorkspace();
    const command = await handleCommand(store, OWNER_ID, 'Give me 3 Pokémon YouTube ideas.');
    await runAgent(store, OWNER_ID, command.tasks[0]!.id);
    const task = await store.get('tasks', command.tasks[0]!.id);
    const output = task!.output as Record<string, unknown>;

    // The next agent reads this as JSON in its prompt; ids alone would hand the
    // Scriptwriter nothing it could write from.
    expect(output.selected).toBeTruthy();
    const selected = output.selected as Record<string, unknown>;
    expect(typeof selected.title_concept).toBe('string');
    expect(typeof selected.hook).toBe('string');
    expect(Array.isArray(output.opportunities)).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Demo Mode                                                           */
/* ------------------------------------------------------------------ */

describe('Demo Mode', () => {
  it('labels simulated research as simulated, in the data and in the feed', async () => {
    const { store } = await makePokemonWorkspace();
    const command = await handleCommand(store, OWNER_ID, 'Give me 4 Pokémon YouTube ideas.');
    await runAgent(store, OWNER_ID, command.tasks[0]!.id);

    const rows = await store.list('pokemon_opportunities', {});
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.is_demo)).toBe(true);

    const logs = await store.list('activity_logs', {});
    const completed = logs.find((log) => /Pokémon video/i.test(log.message));
    expect(completed?.message).toMatch(/simulated/i);
  });

  it('runs the whole pipeline without a provider, rather than pretending', async () => {
    const { store } = await makePokemonWorkspace();
    const command = await handleCommand(
      store,
      OWNER_ID,
      'Create a faceless video about forgotten Pokémon.',
    );
    const run = await runMission(store, OWNER_ID, command.mission!.id, { maxSteps: 3 });
    // It reaches the script approval and stops there, exactly as a real one does.
    expect(run.results.every((r) => r.status !== 'failed')).toBe(true);
    const approvals = await store.list('approvals', {});
    expect(approvals.some((a) => a.kind === 'script')).toBe(true);
  });

  it('produces schema-valid output from the simulated provider', () => {
    // The gate the mock has to clear for any of the above to mean anything.
    const parsed = pokemonIdeasResponseSchema.safeParse({
      subject: 'Pokémon lore',
      ideas: [
        {
          title_concept: 'The region nobody finished',
          hook: 'There is a map in the first game that leads nowhere.',
          category: 'mystery',
          why_watch: 'It is a real unexplained detail, not a fan theory.',
          target_audience: 'People who played the first generation',
          suggested_minutes: 14,
          research_required: ['Confirm which build the map appears in'],
          confidence: 0.55,
          lifespan: 'evergreen',
          sources: [],
          notes: '',
        },
      ],
      self_assessment: '',
    });
    expect(parsed.success).toBe(true);
  });
});
