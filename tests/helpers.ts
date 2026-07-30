import { MemoryStore } from '@/lib/db/memory-store';
import { newAgent } from '@/lib/agents/factory';
import { newMemory } from '@/lib/agents/memory-factory';
import { uuid } from '@/lib/ids';
import { WORKFLOW_DEFINITIONS } from '@/lib/workflows/definitions';
import type { Agent, Business, PlanetVisual } from '@/types/domain';

export const OWNER_ID = '00000000-0000-4000-8000-000000000001';

const VISUAL: PlanetVisual = {
  colour: '#34d399',
  atmosphere: '#6ee7b7',
  radius: 0.6,
  orbit: 5,
  angle: 0,
  speed: 0.03,
  inclination: 0,
  roughness: 0.5,
};

export function makeAgent(overrides: Partial<Agent> & { capabilities: string[] }): Agent {
  // Goes through the same factory the seed and the builder use, so a field
  // added to Agent cannot be missing here and present everywhere else.
  return newAgent({
    owner_id: OWNER_ID,
    name: 'Test Agent',
    slug: `agent-${Math.random().toString(36).slice(2, 8)}`,
    role: 'Test',
    system_prompt: 'You are a test agent.',
    max_tokens: 2048,
    visual: VISUAL,
    ...overrides,
  });
}

export function makeBusiness(overrides: Partial<Business> = {}): Business {
  const timestamp = new Date().toISOString();
  return {
    id: uuid(),
    owner_id: OWNER_ID,
    name: 'Test YouTube',
    slug: 'youtube',
    kind: 'youtube',
    description: 'A test channel',
    colour: '#ef4444',
    currency: 'GBP',
    is_demo: false,
    created_at: timestamp,
    updated_at: timestamp,
    ...overrides,
  };
}

/**
 * A store with one business and a full set of YouTube agents, matching the
 * capabilities the built-in workflows reference.
 */
export async function makeWorkspace() {
  const store = new MemoryStore();
  const business = makeBusiness();
  await store.insert('businesses', business);
  await store.insertMany('workflow_definitions', WORKFLOW_DEFINITIONS);

  const agents = {
    researcher: makeAgent({
      name: 'Researcher',
      slug: 'researcher',
      business_id: business.id,
      capabilities: ['youtube.research.ideas', 'youtube.research.package'],
    }),
    writer: makeAgent({
      name: 'Writer',
      slug: 'writer',
      business_id: business.id,
      capabilities: ['youtube.script.write'],
    }),
    checker: makeAgent({
      name: 'Checker',
      slug: 'checker',
      business_id: business.id,
      capabilities: ['youtube.script.factcheck'],
    }),
  };
  await store.insertMany('agents', Object.values(agents));

  return { store, business, agents };
}

/**
 * A workspace with the full production workforce: research and writing plus
 * narration, visuals, assets, thumbnails, metadata, assembly and QC.
 */
export async function makeProductionWorkspace() {
  const base = await makeWorkspace();
  const { store, business } = base;

  const agents = {
    ...base.agents,
    voiceover: makeAgent({
      name: 'Voiceover Agent',
      slug: 'voiceover',
      business_id: business.id,
      capabilities: ['youtube.voiceover.plan', 'youtube.voiceover.generate'],
    }),
    visualDirector: makeAgent({
      name: 'Visual Director',
      slug: 'visual-director',
      business_id: business.id,
      capabilities: ['youtube.visual_plan'],
    }),
    assetAgent: makeAgent({
      name: 'Asset Agent',
      slug: 'asset',
      business_id: business.id,
      authority_level: 2,
      capabilities: ['youtube.asset_generate'],
    }),
    thumbnailAgent: makeAgent({
      name: 'Thumbnail Strategist',
      slug: 'thumbnail',
      business_id: business.id,
      capabilities: ['youtube.thumbnail.concepts', 'youtube.thumbnail.generate'],
    }),
    metadataAgent: makeAgent({
      name: 'SEO Agent',
      slug: 'seo',
      business_id: business.id,
      capabilities: ['youtube.metadata', 'seo.keywords'],
    }),
    editor: makeAgent({
      name: 'Video Producer',
      slug: 'video-producer',
      business_id: business.id,
      authority_level: 2,
      capabilities: ['youtube.video_assemble', 'youtube.production.plan'],
    }),
    qc: makeAgent({
      name: 'Quality Control',
      slug: 'quality-control',
      business_id: business.id,
      capabilities: ['youtube.quality_check'],
    }),
  };

  await store.insertMany(
    'agents',
    Object.values(agents).filter((a) => !Object.values(base.agents).includes(a)),
  );

  await store.insert('youtube_channels', {
    id: uuid(),
    business_id: business.id,
    name: 'Test Channel',
    handle: '@test',
    niche: 'History documentaries',
    target_audience: 'Adults 25–54',
    external_id: null,
    is_demo: false,
    created_at: new Date().toISOString(),
  });

  return { ...base, agents };
}

/**
 * The production workforce plus a *second* YouTube business carrying its own
 * Islamic agents.
 *
 * Two businesses rather than one is the whole point: it is what makes memory
 * isolation, agent scoping and Manager routing testable rather than assumed.
 */
export async function makeIslamicWorkspace() {
  const base = await makeProductionWorkspace();
  const { store } = base;

  const islamicBusiness = makeBusiness({
    name: 'Islamic Channel',
    slug: 'islamic-channel',
    kind: 'youtube',
    description: 'Sourced Islamic educational content.',
    // Created later than the general channel, so `getWorkspace` still resolves
    // the original one by default.
    created_at: new Date(Date.now() + 1000).toISOString(),
  });
  await store.insert('businesses', islamicBusiness);

  const islamicAgents = {
    researcher: makeAgent({
      name: 'Islamic Researcher',
      slug: 'islamic-researcher',
      business_id: islamicBusiness.id,
      agent_type: 'research',
      template_key: 'islamic_researcher',
      capabilities: ['islamic.research', 'islamic.content_plan'],
    }),
    checker: makeAgent({
      name: 'Islamic Source Checker',
      slug: 'islamic-source-checker',
      business_id: islamicBusiness.id,
      agent_type: 'reviewer',
      template_key: 'islamic_source_checker',
      capabilities: ['islamic.source_verify', 'islamic.script_review'],
    }),
    // The production side of the Islamic channel reuses the same capabilities
    // as every other channel — there is no second media pipeline.
    writer: makeAgent({
      name: 'Islamic Scriptwriter',
      slug: 'islamic-scriptwriter',
      business_id: islamicBusiness.id,
      capabilities: ['youtube.script.write'],
    }),
    factChecker: makeAgent({
      name: 'Islamic Fact Checker',
      slug: 'islamic-fact-checker',
      business_id: islamicBusiness.id,
      capabilities: ['youtube.script.factcheck'],
    }),
  };
  await store.insertMany('agents', Object.values(islamicAgents));

  return { ...base, islamicBusiness, islamicAgents };
}

/**
 * The production workforce plus the Pokémon Researcher, on the same channel.
 *
 * Deliberately additive: the specialist is one more agent alongside the
 * existing ones, not a second pipeline. Everything after its research step is
 * run by the agents that were already there.
 */
export async function makePokemonWorkspace() {
  const base = await makeProductionWorkspace();
  const { store, business } = base;

  const pokemonResearcher = makeAgent({
    name: 'Pokémon Researcher',
    slug: 'pokemon-researcher',
    business_id: business.id,
    agent_type: 'research',
    template_key: 'pokemon_researcher',
    capabilities: [
      'pokemon.research.ideas',
      'pokemon.tcg.research',
      'pokemon.etsy.opportunities',
    ],
  });
  await store.insert('agents', pokemonResearcher);

  return { ...base, pokemonResearcher };
}
