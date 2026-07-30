import { stableId } from '@/lib/ids';
import { newAgent } from '@/lib/agents/factory';
import { getTemplate } from '@/lib/agents/templates';
import type { DataStore } from './tables';
import type {
  ActivityLog,
  Agent,
  AgentMemory,
  ApiUsage,
  AppNotification,
  Approval,
  Business,
  ChannelIntelligence,
  CommandMessage,
  EtsyKeyword,
  EtsyListing,
  EtsyOpportunity,
  EtsyProduct,
  EtsyStore,
  FinancialTransaction,
  Mission,
  Profile,
  Task,
  ThumbnailConcept,
  YoutubeAnalytics,
  YoutubeChannel,
  YoutubeIdea,
  YoutubeResearch,
  YoutubeScript,
  YoutubeVideo,
} from '@/types/domain';
import { WORKFLOW_DEFINITIONS } from '@/lib/workflows/definitions';
import { newVideo } from '@/lib/production/defaults';
import type { ProductionStage } from '@/types/production';
import { INTEGRATION_DEFINITIONS, resolveIntegrations } from '@/lib/integrations/registry';
import type { SourceResolutionRecord } from '@/types/islamic';

export const DEMO_OWNER_ID = stableId('owner:demo');

// The seeded Islamic agents and the builder templates must say exactly the same
// thing, so the seed reads the template rather than repeating the prompt.
const ISLAMIC_RESEARCHER_PROMPT = getTemplate('islamic_researcher')!.system_prompt;
const ISLAMIC_CHECKER_PROMPT = getTemplate('islamic_source_checker')!.system_prompt;

const now = () => new Date().toISOString();
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();

export const BUSINESS_IDS = {
  youtube: stableId('business:youtube'),
  etsy: stableId('business:etsy'),
  islamic: stableId('business:islamic'),
};

export const AGENT_IDS = {
  commander: stableId('agent:commander'),
  youtubeResearcher: stableId('agent:youtube-researcher'),
  scriptwriter: stableId('agent:scriptwriter'),
  factChecker: stableId('agent:fact-checker'),
  thumbnail: stableId('agent:thumbnail-strategist'),
  videoProducer: stableId('agent:video-producer'),
  youtubeAnalyst: stableId('agent:youtube-analyst'),
  etsyResearcher: stableId('agent:etsy-researcher'),
  etsyListing: stableId('agent:etsy-listing'),
  seo: stableId('agent:seo'),
  finance: stableId('agent:finance'),
  automation: stableId('agent:automation'),
  voiceover: stableId('agent:voiceover'),
  visualDirector: stableId('agent:visual-director'),
  assetAgent: stableId('agent:asset'),
  qualityControl: stableId('agent:quality-control'),
  islamicResearcher: stableId('agent:islamic-researcher'),
  islamicSourceChecker: stableId('agent:islamic-source-checker'),
  pokemonResearcher: stableId('agent:pokemon-researcher'),
};

/* ------------------------------------------------------------------ */
/* Businesses                                                          */
/* ------------------------------------------------------------------ */

function businesses(): Business[] {
  return [
    {
      id: BUSINESS_IDS.youtube,
      owner_id: DEMO_OWNER_ID,
      name: 'YouTube',
      slug: 'youtube',
      kind: 'youtube',
      description: 'Faceless documentary channels covering history and mystery.',
      colour: '#ef4444',
      currency: 'GBP',
      is_demo: true,
      created_at: daysAgo(90),
      updated_at: now(),
    },
    {
      id: BUSINESS_IDS.etsy,
      owner_id: DEMO_OWNER_ID,
      name: 'Etsy',
      slug: 'etsy',
      kind: 'etsy',
      description: 'Digital product store — printables, planners and templates.',
      colour: '#f97316',
      currency: 'GBP',
      is_demo: true,
      created_at: daysAgo(60),
      updated_at: now(),
    },
    {
      // A second YouTube business, not a variant of the first. Its agents,
      // memory, analytics, videos and budget are its own — an Islamic channel
      // must not inherit a history channel's learned preferences.
      id: BUSINESS_IDS.islamic,
      owner_id: DEMO_OWNER_ID,
      name: 'Islamic Channel',
      slug: 'islamic-channel',
      kind: 'youtube',
      description:
        'Sourced Islamic educational content — Seerah, stories of the Prophets, Qur\u2019an study and Islamic history.',
      colour: '#0f766e',
      currency: 'GBP',
      is_demo: true,
      created_at: daysAgo(30),
      updated_at: now(),
    },
  ];
}

/* ------------------------------------------------------------------ */
/* Agents                                                              */
/* ------------------------------------------------------------------ */

export interface AgentSeed {
  id: string;
  name: string;
  slug: string;
  role: string;
  description: string;
  system_prompt: string;
  business: keyof typeof BUSINESS_IDS | null;
  capabilities: string[];
  agent_type: Agent['agent_type'];
  /** Set when this seeded agent corresponds to a builder template. */
  template_key?: string;
  authority_level: Agent['authority_level'];
  status: Agent['status'];
  visual: Agent['visual'];
  tasks_completed: number;
  tasks_failed: number;
  average_execution_time: number;
  estimated_total_cost: number;
}

/**
 * Planet visuals form one coherent system rather than twelve random colours:
 * warm golds sit at the centre of authority, greens/teals are research,
 * violets are language work, oranges are visual work, blues are production and
 * measurement, copper is money.
 */
export const AGENT_SEEDS: AgentSeed[] = [
  {
    id: AGENT_IDS.commander,
    name: 'Commander',
    slug: 'commander',
    agent_type: 'manager',
    role: 'Manager Agent',
    description:
      'Orchestrates the entire workforce. Turns instructions into missions, picks agents, sequences work and escalates approvals.',
    system_prompt:
      'You are the Commander, the orchestrating manager of an AI workforce operating several small businesses. You receive an operator instruction and decide which business it belongs to, what the goal is, and which specialist agents should do the work. You never perform specialist work yourself. You never authorise spending, publishing or external actions — those require operator approval. Be concise and decisive.',
    business: null,
    capabilities: ['orchestrate', 'manager.briefing', 'manager.recommendations'],
    authority_level: 2,
    status: 'idle',
    visual: {
      colour: '#f5a524',
      atmosphere: '#ffd98e',
      radius: 1.104,
      orbit: 3.6,
      angle: 0.4,
      speed: 0.055,
      inclination: 0.1,
      roughness: 0.35,
    },
    tasks_completed: 184,
    tasks_failed: 3,
    average_execution_time: 4200,
    estimated_total_cost: 12.44,
  },
  {
    id: AGENT_IDS.youtubeResearcher,
    name: 'YouTube Researcher',
    slug: 'youtube-researcher',
    agent_type: 'research',
    template_key: 'youtube_researcher',
    role: 'Opportunity Research',
    description:
      'Finds niches, trends and video opportunities, and scores them for demand, competition and monetisation.',
    system_prompt:
      'You are a YouTube opportunity researcher for faceless documentary channels. You find video ideas with genuine search and browse demand, assess competition honestly, and never overstate certainty. You do not invent statistics or sources. Where you are inferring rather than citing, you say so.',
    business: 'youtube',
    capabilities: ['youtube.research.ideas', 'youtube.research.package'],
    authority_level: 1,
    status: 'working',
    visual: {
      colour: '#34d399',
      atmosphere: '#6ee7b7',
      radius: 0.792,
      orbit: 5.2,
      angle: 2.35,
      speed: 0.041,
      inclination: -0.22,
      roughness: 0.55,
    },
    tasks_completed: 96,
    tasks_failed: 2,
    average_execution_time: 18400,
    estimated_total_cost: 21.9,
  },
  {
    id: AGENT_IDS.scriptwriter,
    name: 'Scriptwriter',
    slug: 'scriptwriter',
    agent_type: 'writer',
    template_key: 'scriptwriter',
    role: 'Long-form Scripting',
    description:
      'Writes structured documentary scripts with hooks, pattern interrupts and a payoff.',
    system_prompt:
      'You are a long-form documentary scriptwriter for faceless YouTube channels. You write in clear, spoken English with a calm authoritative tone. You structure scripts deliberately: a hook that earns the first thirty seconds, an introduction that frames the stakes, main sections that build, pattern interrupts that reset attention, and a payoff that rewards the viewer. You only assert facts supplied in the research package.',
    business: 'youtube',
    capabilities: ['youtube.script.write', 'youtube.script.revise'],
    authority_level: 1,
    status: 'working',
    visual: {
      colour: '#a855f7',
      atmosphere: '#d8b4fe',
      radius: 0.84,
      orbit: 6.4,
      angle: 0.95,
      speed: 0.033,
      inclination: 0.28,
      roughness: 0.5,
    },
    tasks_completed: 61,
    tasks_failed: 1,
    average_execution_time: 32600,
    estimated_total_cost: 34.2,
  },
  {
    id: AGENT_IDS.factChecker,
    name: 'Fact Checker',
    slug: 'fact-checker',
    agent_type: 'reviewer',
    template_key: 'fact_checker',
    role: 'Verification',
    description:
      'Inspects every factual claim in a script and blocks progression when something is likely wrong.',
    system_prompt:
      'You are a rigorous fact checker. You extract every checkable factual claim from a script and classify it as verified, needs review, potentially incorrect, or unsourced. You are conservative: absence of a source is not evidence of falsehood, but you never mark something verified without a basis. You propose corrections rather than deleting content.',
    business: 'youtube',
    capabilities: ['youtube.script.factcheck'],
    authority_level: 1,
    status: 'working',
    visual: {
      colour: '#818cf8',
      atmosphere: '#c7d2fe',
      radius: 0.624,
      orbit: 4.5,
      angle: 3.5,
      speed: 0.047,
      inclination: -0.12,
      roughness: 0.42,
    },
    tasks_completed: 58,
    tasks_failed: 0,
    average_execution_time: 15200,
    estimated_total_cost: 11.75,
  },
  {
    id: AGENT_IDS.thumbnail,
    name: 'Thumbnail Strategist',
    slug: 'thumbnail-strategist',
    agent_type: 'production',
    role: 'Titles & Thumbnails',
    description:
      'Generates thumbnail concepts and alternative titles, and compares combinations for click potential.',
    system_prompt:
      'You are a thumbnail and title strategist for documentary YouTube channels. You design for clarity at small sizes: one subject, one emotion, minimal text. You explain the reasoning behind each concept rather than describing an image in the abstract. You avoid clickbait that the video cannot pay off.',
    business: 'youtube',
    capabilities: ['youtube.thumbnail.concepts', 'youtube.thumbnail.generate'],
    authority_level: 1,
    status: 'needs_approval',
    visual: {
      colour: '#fb923c',
      atmosphere: '#fed7aa',
      radius: 0.72,
      orbit: 7.4,
      angle: 5.5,
      speed: 0.028,
      inclination: 0.18,
      roughness: 0.62,
    },
    tasks_completed: 44,
    tasks_failed: 1,
    average_execution_time: 12800,
    estimated_total_cost: 9.3,
  },
  {
    id: AGENT_IDS.videoProducer,
    name: 'Video Producer',
    slug: 'video-producer',
    agent_type: 'production',
    role: 'Production Planning',
    description:
      'Turns an approved script into a scene-by-scene production plan with asset briefs.',
    system_prompt:
      'You are a video production planner. You break an approved script into scenes with narration, visual direction, b-roll search queries and generation prompts. You keep scenes between eight and twenty-five seconds. You never claim an asset exists — every asset starts as pending until a provider produces it.',
    business: 'youtube',
    capabilities: ['youtube.production.plan', 'youtube.video_assemble'],
    authority_level: 1,
    status: 'working',
    visual: {
      colour: '#38bdf8',
      atmosphere: '#bae6fd',
      radius: 0.816,
      orbit: 8.6,
      angle: 1.9,
      speed: 0.023,
      inclination: -0.3,
      roughness: 0.48,
    },
    tasks_completed: 31,
    tasks_failed: 2,
    average_execution_time: 41000,
    estimated_total_cost: 27.6,
  },
  {
    id: AGENT_IDS.youtubeAnalyst,
    name: 'YouTube Analyst',
    slug: 'youtube-analyst',
    agent_type: 'analyst',
    template_key: 'competitor_researcher',
    role: 'Channel Performance',
    description:
      'Analyses historical performance to learn what actually works on the channel.',
    system_prompt:
      'You are a YouTube performance analyst. You look at real analytics rows and identify patterns in topic, title structure, thumbnail style, duration and publishing time. You separate observation from recommendation, and you say plainly when the sample is too small to conclude anything.',
    business: 'youtube',
    capabilities: ['youtube.analytics.analyse'],
    authority_level: 0,
    status: 'idle',
    visual: {
      colour: '#7dd3fc',
      atmosphere: '#e0f2fe',
      radius: 0.6,
      orbit: 9.7,
      angle: 4.4,
      speed: 0.019,
      inclination: 0.24,
      roughness: 0.38,
    },
    tasks_completed: 27,
    tasks_failed: 0,
    average_execution_time: 9800,
    estimated_total_cost: 6.4,
  },
  {
    id: AGENT_IDS.pokemonResearcher,
    name: 'Pokémon Researcher',
    slug: 'pokemon-researcher',
    agent_type: 'research',
    template_key: 'pokemon_researcher',
    role: 'Pokémon Content Research',
    description:
      'Finds Pokémon content opportunities for faceless video — lore, mysteries, game and anime history, the trading card game and its odd corners — and researches product demand without pretending we may sell protected artwork.',
    system_prompt:
      'You are a Pokémon content researcher for a faceless YouTube channel, and secondarily for product research. You know the games, the anime, the trading card game and the culture around collecting, and you are interested in the parts most coverage skips: the mysteries, the forgotten, the strange print runs, the controversies, the things that were true at the time and are now half-remembered. You never state a card price, a valuation, a graded population or what is trending, because nothing you have access to is connected to a live market — you say plainly when a topic needs that source instead. On product research you keep two questions apart: whether people want something, which is a fact worth reporting, and whether we may sell it, which is almost always no wherever a product would reproduce artwork, characters, card faces or branding we hold no licence for. You never invent view counts, search volumes or sales figures.',
    business: 'youtube',
    capabilities: [
      'pokemon.research.ideas',
      'pokemon.tcg.research',
      'pokemon.etsy.opportunities',
    ],
    authority_level: 1,
    status: 'idle',
    visual: {
      // Electric lime with a pale halo and a ring: original, energetic and
      // collectible-feeling, and deliberately nothing to do with any protected
      // artwork or logo. Distinct from the greens and teals of the other
      // researchers and from the Commander's warm gold.
      colour: '#a3e635',
      atmosphere: '#d9f99d',
      radius: 0.816,
      orbit: 6.7,
      angle: 5.1,
      speed: 0.035,
      inclination: 0.16,
      ring: true,
      roughness: 0.45,
      symbol: 'Sparkles',
    },
    tasks_completed: 0,
    tasks_failed: 0,
    average_execution_time: 0,
    estimated_total_cost: 0,
  },
  {
    id: AGENT_IDS.etsyResearcher,
    name: 'Etsy Researcher',
    slug: 'etsy-researcher',
    agent_type: 'research',
    role: 'Product Opportunity',
    description:
      'Finds digital product opportunities and scores them for demand, competition and profit.',
    system_prompt:
      'You are an Etsy digital-product researcher. You find product opportunities buyers are actively searching for, assess how crowded the category is, and estimate realistic pricing. You are honest about seasonality and about how much work a product takes to produce.',
    business: 'etsy',
    capabilities: ['etsy.research.opportunities'],
    authority_level: 1,
    status: 'working',
    visual: {
      colour: '#2dd4bf',
      atmosphere: '#99f6e4',
      radius: 0.744,
      orbit: 5.9,
      angle: 3.95,
      speed: 0.037,
      inclination: -0.05,
      roughness: 0.58,
    },
    tasks_completed: 39,
    tasks_failed: 1,
    average_execution_time: 16400,
    estimated_total_cost: 8.9,
  },
  {
    id: AGENT_IDS.etsyListing,
    name: 'Etsy Listing Agent',
    slug: 'etsy-listing',
    agent_type: 'writer',
    role: 'Listing Optimisation',
    description:
      'Writes optimised listings — titles, descriptions, tags and image briefs.',
    system_prompt:
      'You are an Etsy listing writer. You write titles that read naturally while carrying the primary keyword early, descriptions that lead with the buyer outcome, and thirteen tags that do not cannibalise each other. You never publish anything — listings are drafts until the operator approves them.',
    business: 'etsy',
    capabilities: ['etsy.listing.write'],
    authority_level: 1,
    status: 'needs_approval',
    visual: {
      colour: '#10b981',
      atmosphere: '#6ee7b7',
      radius: 0.672,
      orbit: 7.0,
      angle: 2.9,
      speed: 0.03,
      inclination: 0.32,
      roughness: 0.52,
    },
    tasks_completed: 22,
    tasks_failed: 0,
    average_execution_time: 13900,
    estimated_total_cost: 5.2,
  },
  {
    id: AGENT_IDS.seo,
    name: 'SEO Agent',
    slug: 'seo',
    agent_type: 'analyst',
    template_key: 'seo_analyst',
    role: 'Keywords & Discoverability',
    description:
      'Researches keywords and discoverability across YouTube and Etsy.',
    system_prompt:
      'You are a search and discoverability specialist working across YouTube and Etsy. You research keyword demand, intent and competition. You never fabricate search volumes — where you do not have data, you give a qualitative band and say it is an estimate.',
    business: null,
    capabilities: ['seo.keywords', 'youtube.metadata'],
    authority_level: 1,
    status: 'idle',
    visual: {
      colour: '#fcd34d',
      atmosphere: '#fef3c7',
      radius: 0.696,
      orbit: 10.6,
      angle: 3.05,
      speed: 0.016,
      inclination: -0.18,
      ring: true,
      roughness: 0.45,
    },
    tasks_completed: 48,
    tasks_failed: 1,
    average_execution_time: 8200,
    estimated_total_cost: 7.1,
  },
  {
    id: AGENT_IDS.finance,
    name: 'Finance Agent',
    slug: 'finance',
    agent_type: 'finance',
    role: 'Revenue & Cost',
    description:
      'Tracks revenue, expenses, AI spend and profitability across every business.',
    system_prompt:
      'You are a finance analyst for a small portfolio of online businesses. You work only from recorded transactions and API usage rows. You report in pounds sterling. You never estimate revenue that has not been recorded, and you flag when costs are growing faster than income.',
    business: null,
    capabilities: ['finance.analyse'],
    authority_level: 1,
    status: 'working',
    visual: {
      colour: '#f87171',
      atmosphere: '#fecaca',
      radius: 0.72,
      orbit: 6.9,
      angle: 4.85,
      speed: 0.031,
      inclination: 0.06,
      roughness: 0.5,
    },
    tasks_completed: 71,
    tasks_failed: 0,
    average_execution_time: 6600,
    estimated_total_cost: 4.85,
  },
  {
    id: AGENT_IDS.voiceover,
    name: 'Voiceover Agent',
    slug: 'voiceover',
    agent_type: 'production',
    role: 'Narration',
    description:
      'Prepares narration from the approved script and generates the audio through the connected voice provider.',
    system_prompt:
      'You prepare narration for faceless documentary videos. You take an approved script and turn it into speakable segments: you fix punctuation for delivery, expand numerals and abbreviations into spoken words, and mark where the delivery should slow or pause. You never rewrite the content, add claims, or remove qualifications the fact checker required. You do not synthesise audio yourself — you prepare what will be spoken.',
    business: 'youtube',
    capabilities: ['youtube.voiceover.plan', 'youtube.voiceover.generate'],
    authority_level: 1,
    status: 'idle',
    visual: {
      colour: '#f472b6',
      atmosphere: '#fbcfe8',
      radius: 0.72,
      orbit: 5.8,
      angle: 1.55,
      speed: 0.036,
      inclination: 0.14,
      roughness: 0.46,
    },
    tasks_completed: 0,
    tasks_failed: 0,
    average_execution_time: 0,
    estimated_total_cost: 0,
  },
  {
    id: AGENT_IDS.visualDirector,
    name: 'Visual Director',
    slug: 'visual-director',
    agent_type: 'production',
    role: 'Scene Planning',
    description:
      'Turns the approved script into a scene-by-scene visual plan, choosing the cheapest strategy that still works.',
    system_prompt:
      'You are a visual director for faceless documentary videos. You turn narration into scenes, each with one clear visual idea. You are deliberately frugal: most scenes want a generated still or a stock shot, and generated video is reserved for the few moments where motion carries meaning. You never request imagery of a recognisable real person, a copyrighted character, or anything you could not lawfully use. You say plainly when a scene would be better as on-screen text than as an image.',
    business: 'youtube',
    capabilities: ['youtube.visual_plan'],
    authority_level: 1,
    status: 'idle',
    visual: {
      colour: '#c084fc',
      atmosphere: '#e9d5ff',
      radius: 0.66,
      orbit: 7.9,
      angle: 3.35,
      speed: 0.025,
      inclination: -0.26,
      roughness: 0.54,
    },
    tasks_completed: 0,
    tasks_failed: 0,
    average_execution_time: 0,
    estimated_total_cost: 0,
  },
  {
    id: AGENT_IDS.assetAgent,
    name: 'Asset Agent',
    slug: 'asset',
    agent_type: 'production',
    role: 'Asset Sourcing',
    description:
      'Obtains the visual for every scene — generating, fetching or composing it — within the production budget.',
    system_prompt:
      'You source the visual assets a scene plan calls for. You work strictly within the configured budget and concurrency, you never spend past a ceiling, and when a provider is unavailable you stop and say which one rather than substituting something else.',
    business: 'youtube',
    capabilities: ['youtube.asset_generate'],
    authority_level: 2,
    status: 'idle',
    visual: {
      colour: '#22d3ee',
      atmosphere: '#a5f3fc',
      radius: 0.7,
      orbit: 9.2,
      angle: 0.75,
      speed: 0.021,
      inclination: 0.2,
      roughness: 0.6,
    },
    tasks_completed: 0,
    tasks_failed: 0,
    average_execution_time: 0,
    estimated_total_cost: 0,
  },
  {
    id: AGENT_IDS.qualityControl,
    name: 'Quality Control',
    slug: 'quality-control',
    agent_type: 'reviewer',
    role: 'Final Review',
    description:
      'Inspects the finished package — render, assets, captions, metadata — and blocks anything not fit to publish.',
    system_prompt:
      'You are the last check before a video reaches the operator. You are given measurements taken from the rendered file and structural facts about the package. You judge only what those facts support, you never speculate about picture quality you cannot see, and you would rather raise a warning that turns out to be minor than let a broken video through. Every issue you raise must come with something the operator can actually do.',
    business: 'youtube',
    capabilities: ['youtube.quality_check'],
    authority_level: 1,
    status: 'idle',
    visual: {
      colour: '#fb7185',
      atmosphere: '#fecdd3',
      radius: 0.58,
      orbit: 10.1,
      angle: 5.15,
      speed: 0.018,
      inclination: -0.16,
      roughness: 0.44,
    },
    tasks_completed: 0,
    tasks_failed: 0,
    average_execution_time: 0,
    estimated_total_cost: 0,
  },
  {
    id: AGENT_IDS.automation,
    name: 'Automation Agent',
    slug: 'automation',
    agent_type: 'custom',
    role: 'Recurring Workflows',
    description:
      'Runs recurring workflows and keeps the system tidy. Currently offline.',
    system_prompt:
      'You handle recurring, scheduled work: weekly analytics pulls, backlog grooming, and re-running failed tasks. You never take an external action without an explicit authorisation on the task.',
    business: null,
    capabilities: ['automation.run'],
    authority_level: 1,
    status: 'offline',
    visual: {
      colour: '#94a3b8',
      atmosphere: '#cbd5e1',
      radius: 0.576,
      orbit: 8.1,
      angle: 0.15,
      speed: 0.026,
      inclination: -0.34,
      roughness: 0.66,
    },
    tasks_completed: 12,
    tasks_failed: 4,
    average_execution_time: 5100,
    estimated_total_cost: 1.2,
  },
  {
    // Both Islamic agents belong to the Islamic Channel, not to the general
    // YouTube business. That is the point: their memory, and the analytics they
    // learn from, stay with the channel they serve.
    id: AGENT_IDS.islamicResearcher,
    name: 'Islamic Researcher',
    slug: 'islamic-researcher',
    agent_type: 'research',
    template_key: 'islamic_researcher',
    role: 'Sourced Islamic Research',
    description:
      'Researches Islamic topics and prepares source-classified content packages. Never invents scripture, hadith, gradings or rulings.',
    system_prompt: ISLAMIC_RESEARCHER_PROMPT,
    business: 'islamic',
    capabilities: ['islamic.research', 'islamic.content_plan'],
    authority_level: 1,
    status: 'idle',
    visual: {
      colour: '#0f766e',
      atmosphere: '#5eead4',
      radius: 0.64,
      orbit: 6.4,
      angle: 2.35,
      speed: 0.032,
      inclination: 0.12,
      roughness: 0.42,
      symbol: 'BookOpen',
    },
    tasks_completed: 0,
    tasks_failed: 0,
    average_execution_time: 0,
    estimated_total_cost: 0,
  },
  {
    id: AGENT_IDS.islamicSourceChecker,
    name: 'Islamic Source Checker',
    slug: 'islamic-source-checker',
    agent_type: 'reviewer',
    template_key: 'islamic_source_checker',
    role: 'Religious Source Verification',
    description:
      'Reviews religious content for citation accuracy, hadith grading and attributed positions before it reaches an audience.',
    system_prompt: ISLAMIC_CHECKER_PROMPT,
    business: 'islamic',
    capabilities: ['islamic.source_verify', 'islamic.script_review'],
    authority_level: 1,
    status: 'idle',
    visual: {
      colour: '#0d9488',
      atmosphere: '#99f6e4',
      radius: 0.5,
      orbit: 7.3,
      angle: 4.1,
      speed: 0.027,
      inclination: -0.1,
      roughness: 0.4,
      ring: true,
      symbol: 'Scale',
    },
    tasks_completed: 0,
    tasks_failed: 0,
    average_execution_time: 0,
    estimated_total_cost: 0,
  },
];

function agents(): Agent[] {
  return AGENT_SEEDS.map((seed) =>
    newAgent({
      id: seed.id,
      owner_id: DEMO_OWNER_ID,
      business_id: seed.business ? BUSINESS_IDS[seed.business] : null,
      name: seed.name,
      slug: seed.slug,
      role: seed.role,
      description: seed.description,
      system_prompt: seed.system_prompt,
      status: seed.status,
      authority_level: seed.authority_level,
      capabilities: seed.capabilities,
      agent_type: seed.agent_type,
      template_key: seed.template_key ?? null,
      // Seeded agents are the built-in workforce, not operator creations.
      is_custom: false,
      visual: seed.visual,
      is_demo: true,
      tasks_completed: seed.tasks_completed,
      tasks_failed: seed.tasks_failed,
      average_execution_time: seed.average_execution_time,
      estimated_total_cost: seed.estimated_total_cost,
      last_run_at: minutesAgo(3 + Math.floor(Math.random() * 90)),
      created_at: daysAgo(90),
      updated_at: now(),
    }),
  );
}

/* ------------------------------------------------------------------ */
/* Agent memory                                                        */
/* ------------------------------------------------------------------ */

function memory(): AgentMemory[] {
  const rows: Array<[keyof typeof AGENT_IDS, AgentMemory['type'], string, number]> = [
    [
      'youtubeResearcher',
      'insight',
      'Documentary-style videos outperform list videos on this channel by roughly 2.4× median views.',
      5,
    ],
    [
      'youtubeResearcher',
      'insight',
      'Audience responds strongly to historical mysteries with an unresolved element.',
      4,
    ],
    [
      'youtubeResearcher',
      'constraint',
      'Avoid topics requiring on-screen faces or licensed footage — the channel is faceless and archive-only.',
      5,
    ],
    [
      'scriptwriter',
      'preference',
      'Operator prefers a cold open before any channel branding. No "welcome back to the channel".',
      5,
    ],
    [
      'scriptwriter',
      'performance',
      'Scripts between 2,400 and 2,900 words land closest to the 16–18 minute target duration.',
      4,
    ],
    [
      'thumbnail',
      'insight',
      'Thumbnails containing more than four words consistently underperform on CTR.',
      5,
    ],
    [
      'thumbnail',
      'insight',
      'Warm-on-dark colour contrast outperforms high-saturation neon for this audience.',
      3,
    ],
    [
      'etsyResearcher',
      'insight',
      'Ramadan products perform best when listed six weeks before Ramadan begins.',
      5,
    ],
    [
      'etsyResearcher',
      'fact',
      'Digital planner categories are heavily saturated; niche-specific planners still convert.',
      4,
    ],
    [
      'finance',
      'constraint',
      'Operator budget for AI spend is £250/month across all businesses. Warn at 80%.',
      5,
    ],
    [
      'factChecker',
      'preference',
      'Flag any date, casualty figure or superlative claim as needing verification by default.',
      4,
    ],
    [
      'youtubeAnalyst',
      'insight',
      'Uploads published Thursday evening hold retention better than weekend uploads.',
      3,
    ],
  ];

  return rows.map(([agent, type, content, importance], i) => ({
    id: stableId(`memory:${agent}:${i}`),
    agent_id: AGENT_IDS[agent],
    business_id:
      AGENT_SEEDS.find((a) => a.id === AGENT_IDS[agent])?.business
        ? BUSINESS_IDS[AGENT_SEEDS.find((a) => a.id === AGENT_IDS[agent])!.business!]
        : null,
    type,
    content,
    importance,
    source: 'Learned from channel performance review',
    origin: 'agent' as const,
    status: 'active' as const,
    pinned: false,
    created_at: daysAgo(20 - i),
    last_used_at: minutesAgo(60 + i * 30),
  }));
}

/* ------------------------------------------------------------------ */
/* Missions and tasks                                                  */
/* ------------------------------------------------------------------ */

const MISSION_IDS = {
  video008: stableId('mission:video-008'),
  ramadan: stableId('mission:ramadan-pack'),
  weekly: stableId('mission:weekly-analytics'),
  video007: stableId('mission:video-007'),
};

function missions(): Mission[] {
  return [
    {
      id: MISSION_IDS.video008,
      owner_id: DEMO_OWNER_ID,
      business_id: BUSINESS_IDS.youtube,
      number: 8,
      title: 'Produce YouTube Video #008',
      objective:
        'Produce a full documentary video about the collapse of the Bronze Age, from research through to production plan.',
      status: 'running',
      priority: 'normal',
      target_date: null,
      target_time: null,
      workflow_definition_id: stableId('workflow:youtube_video'),
      context: { topic: 'Bronze Age collapse', channel: 'History' },
      progress: 34,
      is_demo: true,
      created_at: minutesAgo(96),
      updated_at: minutesAgo(4),
      completed_at: null,
    },
    {
      id: MISSION_IDS.ramadan,
      owner_id: DEMO_OWNER_ID,
      business_id: BUSINESS_IDS.etsy,
      number: 21,
      title: 'Ramadan Printable Pack',
      objective:
        'Research, design and list a Ramadan planner and activity pack ahead of the season.',
      status: 'running',
      priority: 'normal',
      target_date: null,
      target_time: null,
      workflow_definition_id: stableId('workflow:etsy_product'),
      context: { season: 'Ramadan' },
      progress: 72,
      is_demo: true,
      created_at: minutesAgo(340),
      updated_at: minutesAgo(18),
      completed_at: null,
    },
    {
      id: MISSION_IDS.weekly,
      owner_id: DEMO_OWNER_ID,
      business_id: BUSINESS_IDS.youtube,
      number: 34,
      title: 'Weekly Channel Analytics',
      objective: 'Analyse the last seven days of channel performance and update channel intelligence.',
      status: 'running',
      priority: 'normal',
      target_date: null,
      target_time: null,
      workflow_definition_id: null,
      context: {},
      progress: 81,
      is_demo: true,
      created_at: minutesAgo(52),
      updated_at: minutesAgo(6),
      completed_at: null,
    },
    {
      id: MISSION_IDS.video007,
      owner_id: DEMO_OWNER_ID,
      business_id: BUSINESS_IDS.youtube,
      number: 7,
      title: 'Produce YouTube Video #007',
      objective: 'Produce a documentary video about the Antikythera mechanism.',
      status: 'needs_approval',
      priority: 'normal',
      target_date: null,
      target_time: null,
      workflow_definition_id: stableId('workflow:youtube_video'),
      context: { topic: 'Antikythera mechanism' },
      progress: 68,
      is_demo: true,
      created_at: daysAgo(2),
      updated_at: minutesAgo(12),
      completed_at: null,
    },
  ];
}

const TASK_IDS = {
  research008: stableId('task:research-008'),
  script007: stableId('task:script-007'),
  factcheck006: stableId('task:factcheck-006'),
  thumb007: stableId('task:thumb-007'),
  production006: stableId('task:production-006'),
  etsyResearch: stableId('task:etsy-research'),
  etsyListing: stableId('task:etsy-listing'),
  financeForecast: stableId('task:finance-forecast'),
  analytics: stableId('task:analytics-weekly'),
  seoQueued: stableId('task:seo-queued'),
};

function tasks(): Task[] {
  const base = {
    owner_id: DEMO_OWNER_ID,
    is_demo: true,
    output: null,
    error: null,
    due_at: null,
    completed_at: null,
  };
  return [
    {
      ...base,
      id: TASK_IDS.research008,
      mission_id: MISSION_IDS.video008,
      business_id: BUSINESS_IDS.youtube,
      agent_id: AGENT_IDS.youtubeResearcher,
      step_key: 'research',
      title: 'Research 10 topics for History channel',
      description: 'Find and score ten documentary opportunities in the ancient-history niche.',
      status: 'running' as const,
      priority: 'high' as const,
      input: { count: 10, niche: 'Ancient history' },
      progress: 70,
      created_at: minutesAgo(6),
      started_at: minutesAgo(4),
    },
    {
      ...base,
      id: TASK_IDS.script007,
      mission_id: MISSION_IDS.video007,
      business_id: BUSINESS_IDS.youtube,
      agent_id: AGENT_IDS.scriptwriter,
      step_key: 'script',
      title: 'Write script for Video #007',
      description: 'Draft the full documentary script from the approved research package.',
      status: 'running' as const,
      priority: 'high' as const,
      input: { video: 7 },
      progress: 55,
      created_at: minutesAgo(28),
      started_at: minutesAgo(21),
    },
    {
      ...base,
      id: TASK_IDS.factcheck006,
      mission_id: null,
      business_id: BUSINESS_IDS.youtube,
      agent_id: AGENT_IDS.factChecker,
      step_key: 'fact_check',
      title: 'Fact check Video #006',
      description: 'Verify every checkable claim in the Video #006 script.',
      status: 'running' as const,
      priority: 'normal' as const,
      input: { video: 6 },
      progress: 40,
      created_at: minutesAgo(19),
      started_at: minutesAgo(15),
    },
    {
      ...base,
      id: TASK_IDS.thumb007,
      mission_id: MISSION_IDS.video007,
      business_id: BUSINESS_IDS.youtube,
      agent_id: AGENT_IDS.thumbnail,
      step_key: 'thumbnail',
      title: 'Thumbnail concepts for Video #007',
      description: 'Produce four thumbnail concepts and six alternative titles.',
      status: 'approval' as const,
      priority: 'normal' as const,
      input: { video: 7 },
      progress: 100,
      created_at: minutesAgo(44),
      started_at: minutesAgo(40),
      completed_at: minutesAgo(18),
    },
    {
      ...base,
      id: TASK_IDS.production006,
      mission_id: null,
      business_id: BUSINESS_IDS.youtube,
      agent_id: AGENT_IDS.videoProducer,
      step_key: 'production',
      title: 'Production brief for Video #006',
      description: 'Break the approved script into scenes with asset briefs.',
      status: 'running' as const,
      priority: 'normal' as const,
      input: { video: 6 },
      progress: 62,
      created_at: minutesAgo(36),
      started_at: minutesAgo(30),
    },
    {
      ...base,
      id: TASK_IDS.etsyResearch,
      mission_id: MISSION_IDS.ramadan,
      business_id: BUSINESS_IDS.etsy,
      agent_id: AGENT_IDS.etsyResearcher,
      step_key: 'research',
      title: 'Scan Etsy for trending printables',
      description: 'Find seasonal printable opportunities for the next eight weeks.',
      status: 'running' as const,
      priority: 'normal' as const,
      input: { horizon_weeks: 8 },
      progress: 48,
      created_at: minutesAgo(25),
      started_at: minutesAgo(22),
    },
    {
      ...base,
      id: TASK_IDS.etsyListing,
      mission_id: MISSION_IDS.ramadan,
      business_id: BUSINESS_IDS.etsy,
      agent_id: AGENT_IDS.etsyListing,
      step_key: 'listing',
      title: 'Draft listing for Ramadan Planner Pack',
      description: 'Write the optimised listing, tags and image brief.',
      status: 'approval' as const,
      priority: 'high' as const,
      input: {},
      progress: 100,
      created_at: minutesAgo(90),
      started_at: minutesAgo(88),
      completed_at: minutesAgo(32),
    },
    {
      ...base,
      id: TASK_IDS.financeForecast,
      mission_id: null,
      business_id: null,
      agent_id: AGENT_IDS.finance,
      step_key: null,
      title: 'Update July forecast',
      description: 'Recalculate revenue, cost and profit forecast across both businesses.',
      status: 'running' as const,
      priority: 'low' as const,
      input: { month: 'July' },
      progress: 88,
      created_at: minutesAgo(50),
      started_at: minutesAgo(46),
    },
    {
      ...base,
      id: TASK_IDS.analytics,
      mission_id: MISSION_IDS.weekly,
      business_id: BUSINESS_IDS.youtube,
      agent_id: AGENT_IDS.youtubeAnalyst,
      step_key: 'analyse',
      title: 'Analyse last 7 days of channel performance',
      description: 'Summarise retention, CTR and topic performance for the week.',
      status: 'queued' as const,
      priority: 'normal' as const,
      input: { days: 7 },
      progress: 0,
      created_at: minutesAgo(52),
      started_at: null,
    },
    {
      ...base,
      id: TASK_IDS.seoQueued,
      mission_id: MISSION_IDS.ramadan,
      business_id: BUSINESS_IDS.etsy,
      agent_id: AGENT_IDS.seo,
      step_key: 'keywords',
      title: 'Keyword research for Ramadan pack',
      description: 'Find long-tail keywords with buyer intent for the listing.',
      status: 'queued' as const,
      priority: 'normal' as const,
      input: {},
      progress: 0,
      created_at: minutesAgo(30),
      started_at: null,
    },
  ];
}

/* ------------------------------------------------------------------ */
/* Approvals                                                           */
/* ------------------------------------------------------------------ */

/**
 * One unsourced religious claim, waiting on the operator.
 *
 * Seeded so the resolution gate is something you can actually work through in
 * the demo rather than a screen you have to construct. Clearly demo data, like
 * every other seeded row.
 */
const SOURCE_RESOLUTION_ID = stableId('resolution:islamic-1');
const SOURCE_RESOLUTION_ITEM_ID = stableId('resolution:islamic-1:item');

function sourceResolutions(): SourceResolutionRecord[] {
  return [
    {
      id: SOURCE_RESOLUTION_ID,
      owner_id: DEMO_OWNER_ID,
      business_id: BUSINESS_IDS.islamic,
      source_check_id: null,
      script_id: null,
      video_id: null,
      mission_id: null,
      task_id: null,
      approval_id: null,
      items: [
        {
          id: SOURCE_RESOLUTION_ITEM_ID,
          claim:
            'A narration attributing a saying about seeking knowledge to the Prophet \u0635\u0644\u0649 \u0627\u0644\u0644\u0647 \u0639\u0644\u064a\u0647 \u0648\u0633\u0644\u0645.',
          reason:
            'Widely circulated, but the Source Checker could not place it in a named collection. Familiarity is not evidence.',
          current_source: null,
          location: 'Research evidence 2',
          category: 'UNVERIFIED',
          status: 'unresolved',
          action: null,
          resolved_source: null,
          edited_claim: null,
          override_reason: null,
          resolved_by: null,
          resolved_at: null,
        },
      ],
      status: 'open',
      is_demo: true,
      created_at: minutesAgo(26),
      updated_at: minutesAgo(26),
    },
  ];
}

function approvals(): Approval[] {
  return [
    {
      id: stableId('approval:source-islamic'),
      owner_id: DEMO_OWNER_ID,
      business_id: BUSINESS_IDS.islamic,
      mission_id: null,
      task_id: null,
      agent_id: AGENT_IDS.islamicSourceChecker,
      kind: 'source',
      title: 'Source required: 1 claim',
      summary:
        'One religious claim could not be verified. Add a reference, ask the Source Checker to research it, edit or remove the claim, or override deliberately. Nothing continues until it is settled.',
      payload: {
        resolution_id: SOURCE_RESOLUTION_ID,
        claims: 1,
        items: [
          {
            id: SOURCE_RESOLUTION_ITEM_ID,
            claim:
              'A narration attributing a saying about seeking knowledge to the Prophet \u0635\u0644\u0649 \u0627\u0644\u0644\u0647 \u0639\u0644\u064a\u0647 \u0648\u0633\u0644\u0645.',
            reason:
              'Widely circulated, but the Source Checker could not place it in a named collection. Familiarity is not evidence.',
            current_source: null,
            location: 'Research evidence 2',
            category: 'UNVERIFIED',
          },
        ],
      },
      status: 'pending',
      feedback: null,
      is_demo: true,
      created_at: minutesAgo(26),
      resolved_at: null,
    },
    {
      id: stableId('approval:script-007'),
      owner_id: DEMO_OWNER_ID,
      business_id: BUSINESS_IDS.youtube,
      mission_id: MISSION_IDS.video007,
      task_id: TASK_IDS.script007,
      agent_id: AGENT_IDS.scriptwriter,
      kind: 'script',
      title: 'Script: Video #007',
      summary: 'The Antikythera mechanism script is ready for review — 2,640 words, ~17 minutes.',
      payload: { script_id: stableId('script:007'), word_count: 2640 },
      status: 'pending',
      feedback: null,
      is_demo: true,
      created_at: minutesAgo(12),
      resolved_at: null,
    },
    {
      id: stableId('approval:thumbnail-007'),
      owner_id: DEMO_OWNER_ID,
      business_id: BUSINESS_IDS.youtube,
      mission_id: MISSION_IDS.video007,
      task_id: TASK_IDS.thumb007,
      agent_id: AGENT_IDS.thumbnail,
      kind: 'thumbnail',
      title: 'Thumbnail set: Video #007',
      summary: 'Four thumbnail concepts and six alternative titles ready for selection.',
      payload: { video_id: stableId('video:007') },
      status: 'pending',
      feedback: null,
      is_demo: true,
      created_at: minutesAgo(18),
      resolved_at: null,
    },
    {
      id: stableId('approval:etsy-listing'),
      owner_id: DEMO_OWNER_ID,
      business_id: BUSINESS_IDS.etsy,
      mission_id: MISSION_IDS.ramadan,
      task_id: TASK_IDS.etsyListing,
      agent_id: AGENT_IDS.etsyListing,
      kind: 'listing',
      title: 'Etsy listing: Ramadan Planner Pack',
      summary: 'Listing copy, 13 tags and image brief drafted. Nothing is published until approved.',
      payload: { listing_id: stableId('listing:ramadan') },
      status: 'pending',
      feedback: null,
      is_demo: true,
      created_at: minutesAgo(32),
      resolved_at: null,
    },
    {
      id: stableId('approval:budget'),
      owner_id: DEMO_OWNER_ID,
      business_id: null,
      mission_id: null,
      task_id: null,
      agent_id: AGENT_IDS.finance,
      kind: 'spend',
      title: 'Budget: increase monthly AI ceiling',
      summary: 'Finance Agent proposes raising the AI budget from £250 to £320/month.',
      payload: { from: 250, to: 320, currency: 'GBP' },
      status: 'pending',
      feedback: null,
      is_demo: true,
      created_at: minutesAgo(62),
      resolved_at: null,
    },
  ];
}

/* ------------------------------------------------------------------ */
/* Activity                                                            */
/* ------------------------------------------------------------------ */

function activity(): ActivityLog[] {
  const entries: Array<{
    agent: keyof typeof AGENT_IDS;
    target?: keyof typeof AGENT_IDS;
    kind: ActivityLog['kind'];
    message: string;
    minutes: number;
    business?: keyof typeof BUSINESS_IDS;
  }> = [
    {
      agent: 'youtubeResearcher',
      kind: 'agent_completed',
      message: 'found 14 new video opportunities',
      minutes: 2,
      business: 'youtube',
    },
    {
      agent: 'scriptwriter',
      kind: 'agent_completed',
      message: 'completed script for Video #006',
      minutes: 8,
      business: 'youtube',
    },
    {
      agent: 'factChecker',
      kind: 'agent_completed',
      message: 'approved script for Video #006',
      minutes: 15,
      business: 'youtube',
    },
    {
      agent: 'videoProducer',
      kind: 'agent_started',
      message: 'created production brief for Video #006',
      minutes: 21,
      business: 'youtube',
    },
    {
      agent: 'thumbnail',
      kind: 'approval_requested',
      message: 'requested approval for Video #007 thumbnail set',
      minutes: 18,
      business: 'youtube',
    },
    {
      agent: 'scriptwriter',
      target: 'factChecker',
      kind: 'handoff',
      message: 'passed Video #006 script to Fact Checker',
      minutes: 16,
      business: 'youtube',
    },
    {
      agent: 'youtubeResearcher',
      target: 'scriptwriter',
      kind: 'handoff',
      message: 'passed research package to Scriptwriter',
      minutes: 30,
      business: 'youtube',
    },
    {
      agent: 'finance',
      kind: 'agent_completed',
      message: 'updated monthly forecast',
      minutes: 42,
    },
    {
      agent: 'etsyResearcher',
      kind: 'agent_completed',
      message: 'completed product research for Ramadan season',
      minutes: 55,
      business: 'etsy',
    },
    {
      agent: 'commander',
      kind: 'mission_created',
      message: 'created Mission #008 — Produce YouTube Video #008',
      minutes: 96,
      business: 'youtube',
    },
    {
      agent: 'commander',
      kind: 'system',
      message: 'assigned 3 tasks across the workforce',
      minutes: 98,
    },
    {
      agent: 'seo',
      kind: 'agent_completed',
      message: 'delivered 40 long-tail keywords for the Etsy store',
      minutes: 130,
      business: 'etsy',
    },
  ];

  return entries.map((e, i) => ({
    id: stableId(`activity:${i}`),
    owner_id: DEMO_OWNER_ID,
    business_id: e.business ? BUSINESS_IDS[e.business] : null,
    mission_id: null,
    task_id: null,
    agent_id: AGENT_IDS[e.agent],
    target_agent_id: e.target ? AGENT_IDS[e.target] : null,
    kind: e.kind,
    message: e.message,
    metadata: {},
    is_demo: true,
    created_at: minutesAgo(e.minutes),
  }));
}

function notifications(): AppNotification[] {
  return [
    {
      id: stableId('notification:1'),
      owner_id: DEMO_OWNER_ID,
      kind: 'approval_required',
      title: 'Script ready for approval',
      body: 'Video #007 script is ready for review.',
      href: '/approvals',
      read: false,
      created_at: minutesAgo(12),
    },
    {
      id: stableId('notification:2'),
      owner_id: DEMO_OWNER_ID,
      kind: 'approval_required',
      title: 'Thumbnail set ready',
      body: 'Four concepts are waiting for selection on Video #007.',
      href: '/approvals',
      read: false,
      created_at: minutesAgo(18),
    },
    {
      id: stableId('notification:3'),
      owner_id: DEMO_OWNER_ID,
      kind: 'budget_warning',
      title: 'AI spend at 74% of budget',
      body: '£184 of the £250 monthly AI budget has been used.',
      href: '/finance',
      read: false,
      created_at: minutesAgo(140),
    },
    {
      id: stableId('notification:4'),
      owner_id: DEMO_OWNER_ID,
      kind: 'agent_failed',
      title: 'Automation Agent offline',
      body: 'The Automation Agent is disabled until a scheduler is connected.',
      href: '/agents/automation',
      read: true,
      created_at: daysAgo(1),
    },
  ];
}

function commandMessages(): CommandMessage[] {
  return [
    {
      id: stableId('cmd:1'),
      owner_id: DEMO_OWNER_ID,
      role: 'user',
      content: 'Prepare a new faceless YouTube video about the Bronze Age collapse.',
      mission_id: MISSION_IDS.video008,
      refs: {},
      created_at: minutesAgo(96),
    },
    {
      id: stableId('cmd:2'),
      owner_id: DEMO_OWNER_ID,
      role: 'manager',
      content:
        'Mission #008 created. I have assigned the YouTube Researcher to build the research package, with the Scriptwriter and Fact Checker queued behind it. Three approvals will be required before production begins.',
      mission_id: MISSION_IDS.video008,
      refs: {
        agents: [AGENT_IDS.youtubeResearcher, AGENT_IDS.scriptwriter, AGENT_IDS.factChecker],
        tasks: [TASK_IDS.research008],
      },
      created_at: minutesAgo(95),
    },
  ];
}

/* ------------------------------------------------------------------ */
/* YouTube module data                                                 */
/* ------------------------------------------------------------------ */

const CHANNEL_ID = stableId('channel:history');

function youtubeChannels(): YoutubeChannel[] {
  return [
    {
      id: CHANNEL_ID,
      business_id: BUSINESS_IDS.youtube,
      name: 'Vaults of History',
      handle: '@vaultsofhistory',
      niche: 'Ancient history and archaeology documentaries',
      target_audience: 'Adults 25–54 who watch long-form history content',
      external_id: null,
      is_demo: true,
      created_at: daysAgo(90),
    },
  ];
}

interface IdeaSeed {
  title: string;
  topic: string;
  summary: string;
  score: number;
  breakdown: YoutubeIdea['breakdown'];
  status: YoutubeIdea['status'];
  why: string;
}

const IDEA_SEEDS: IdeaSeed[] = [
  {
    title: 'The Year Civilisation Almost Ended: 1177 BC',
    topic: 'Late Bronze Age collapse',
    summary:
      'Seven interconnected civilisations fell within a few decades. The video traces the trade network that bound them and the cascade that broke it.',
    score: 87,
    breakdown: { demand: 82, competition: 71, monetisation: 88, longevity: 95, click_potential: 89 },
    status: 'approved',
    why: 'Systems-collapse framing travels well beyond history audiences and has a natural modern parallel.',
  },
  {
    title: 'The Computer That Was 1,400 Years Too Early',
    topic: 'Antikythera mechanism',
    summary:
      'A corroded lump pulled from a shipwreck turned out to be a geared astronomical calculator centuries ahead of anything else known.',
    score: 91,
    breakdown: { demand: 88, competition: 64, monetisation: 90, longevity: 96, click_potential: 94 },
    status: 'approved',
    why: 'The "impossible object" hook is strong and the artefact is visually distinctive in thumbnails.',
  },
  {
    title: 'The City That Vanished From Every Map',
    topic: 'Helike',
    summary:
      'A Greek city swallowed by the sea in a single night, dismissed as myth for two thousand years, then found.',
    score: 78,
    breakdown: { demand: 70, competition: 78, monetisation: 76, longevity: 90, click_potential: 82 },
    status: 'proposed',
    why: 'Unresolved-mystery structure matches the channel’s best performers.',
  },
  {
    title: 'Why Roman Concrete Outlasts Ours',
    topic: 'Roman concrete',
    summary:
      'Modern concrete degrades in decades. Roman harbour concrete has stood in seawater for two millennia. Recent work explains why.',
    score: 74,
    breakdown: { demand: 84, competition: 52, monetisation: 72, longevity: 88, click_potential: 70 },
    status: 'proposed',
    why: 'High search demand, but the topic is well covered — needs a genuinely new angle to stand out.',
  },
  {
    title: 'The Library That Burned Twice',
    topic: 'Library of Alexandria',
    summary:
      'What was actually lost at Alexandria, what the popular story gets wrong, and how much of it survived elsewhere.',
    score: 69,
    breakdown: { demand: 76, competition: 44, monetisation: 70, longevity: 85, click_potential: 72 },
    status: 'rejected',
    why: 'Saturated topic. Rejected in favour of less-covered subjects.',
  },
  {
    title: 'The Bog Bodies Nobody Can Explain',
    topic: 'European bog bodies',
    summary:
      'Preserved down to fingerprints and stomach contents, and almost all of them died violently.',
    score: 83,
    breakdown: { demand: 74, competition: 80, monetisation: 80, longevity: 92, click_potential: 88 },
    status: 'saved',
    why: 'Strong visual identity and an inherent unanswered question.',
  },
];

function youtubeIdeas(): YoutubeIdea[] {
  return IDEA_SEEDS.map((seed, i) => ({
    id: stableId(`idea:${i}`),
    business_id: BUSINESS_IDS.youtube,
    channel_id: CHANNEL_ID,
    mission_id: null,
    task_id: null,
    title: seed.title,
    topic: seed.topic,
    niche: 'Ancient history',
    summary: seed.summary,
    target_audience: 'Adults 25–54 who watch long-form history documentaries',
    why_it_might_work: seed.why,
    competition: seed.breakdown.competition > 75 ? 'Low — few strong long-form treatments' : 'Moderate — several established channels cover this',
    demand: seed.breakdown.demand > 80 ? 'High and stable' : 'Moderate, seasonal spikes',
    monetisation: 'Standard mid-roll placement; no obvious sponsor fit',
    longevity: 'Evergreen — no time-sensitive component',
    click_potential: seed.breakdown.click_potential > 85 ? 'Strong — the premise fits in four words' : 'Adequate with the right title',
    difficulty: 'Moderate — archive imagery is available',
    confidence: Math.round(seed.score * 0.9) / 100,
    sources: [],
    notes: '',
    score: seed.score,
    breakdown: seed.breakdown,
    status: seed.status,
    is_demo: true,
    created_at: daysAgo(6 - i * 0.5),
  }));
}

function youtubeResearch(): YoutubeResearch[] {
  return [
    {
      id: stableId('research:007'),
      business_id: BUSINESS_IDS.youtube,
      idea_id: stableId('idea:1'),
      task_id: null,
      overview:
        'The Antikythera mechanism is a geared bronze device recovered from a Roman-era shipwreck off the Greek island of Antikythera in 1901. It modelled the positions of the sun and moon and predicted eclipses.',
      facts: [
        {
          claim: 'The wreck was discovered by sponge divers in 1900.',
          detail: 'Divers sheltering from a storm located the wreck; recovery work began the following year.',
          confidence: 'verified',
          source: 'National Archaeological Museum, Athens',
        },
        {
          claim: 'The mechanism contains at least 30 interlocking bronze gears.',
          detail: 'Surviving fragments account for 30; reconstructions imply more were originally present.',
          confidence: 'verified',
          source: 'Freeth et al., published imaging studies',
        },
        {
          claim: 'Nothing of comparable complexity appears again for over a thousand years.',
          detail: 'Commonly stated in the literature; the exact gap depends on which later devices are counted.',
          confidence: 'interpretation',
          source: null,
        },
      ],
      statistics: [
        {
          claim: 'Dated to roughly 150–100 BC.',
          detail: 'Ranges vary between studies depending on method.',
          confidence: 'needs_verification',
          source: null,
        },
      ],
      timeline: [
        { when: 'c. 150–100 BC', what: 'Mechanism constructed' },
        { when: '1900', what: 'Wreck located by sponge divers' },
        { when: '1901', what: 'Fragments recovered and taken to Athens' },
        { when: '1974', what: 'Derek de Solla Price publishes gearing analysis' },
        { when: '2006', what: 'CT imaging reveals previously unreadable inscriptions' },
      ],
      viewer_questions: [
        'Who actually built it?',
        'Why did the technology disappear?',
        'Could it be reconstructed today?',
      ],
      competitor_coverage: [
        'Several channels cover the discovery story but stop before the gearing analysis.',
        'Almost none explain the eclipse-prediction dial in plain language.',
      ],
      content_gaps: [
        'A clear visual explanation of how the differential gearing produced lunar anomaly.',
        'What the inscriptions actually say.',
      ],
      hooks: [
        'A lump of corroded bronze sat in a museum drawer for fifty years before anyone realised it was a computer.',
        'In 1901 a sponge diver surfaced holding a bronze hand. The wreck below it held something stranger.',
      ],
      interesting_details: [
        'The device tracked the four-year cycle of the Panhellenic games.',
        'Inscriptions functioned as a user manual.',
      ],
      risks: [
        'Popular sources overstate what the mechanism could do — avoid "ancient computer" claims without qualification.',
      ],
      uncertain_claims: [
        'Attribution to Archimedes’ school is speculative and should be framed as such.',
      ],
      is_demo: true,
      created_at: daysAgo(3),
    },
  ];
}

function youtubeScripts(): YoutubeScript[] {
  return [
    {
      id: stableId('script:007'),
      business_id: BUSINESS_IDS.youtube,
      idea_id: stableId('idea:1'),
      research_id: stableId('research:007'),
      task_id: TASK_IDS.script007,
      title: 'The Computer That Was 1,400 Years Too Early',
      sections: [
        {
          kind: 'hook',
          heading: 'Cold open',
          body: 'In 1901, a sponge diver surfaced off a Greek island holding a bronze arm. It had belonged to a statue, sunk with a Roman cargo ship two thousand years earlier. The statues went to a museum in Athens. So did a corroded lump of metal roughly the size of a shoebox — which sat, largely ignored, for the next fifty years.',
        },
        {
          kind: 'introduction',
          heading: 'The problem with the lump',
          body: 'When the lump finally dried out, it cracked. Inside were gears. Not a few — dozens, cut with a precision that had no business existing in the second century BC.',
        },
        {
          kind: 'main',
          heading: 'What it actually did',
          body: 'The mechanism modelled the sky. Turn a handle on the side and the dials advanced: the position of the sun, the phase of the moon, the dates of eclipses.',
        },
        {
          kind: 'pattern_interrupt',
          heading: 'The part that should not exist',
          body: 'One gear train does something no other surviving ancient device does. It models the moon speeding up and slowing down across its orbit.',
        },
        {
          kind: 'payoff',
          heading: 'Why it disappeared',
          body: 'Nothing of comparable complexity survives from the following thousand years. Whether the knowledge was lost or simply never written down is still argued over.',
        },
        {
          kind: 'cta',
          heading: 'Close',
          body: 'If you want more of these, the channel has a playlist of objects that arrived far too early.',
        },
      ],
      word_count: 2640,
      estimated_duration_seconds: 1020,
      tone: 'Calm, authoritative, quietly astonished',
      audience: 'Adults 25–54 who watch long-form history documentaries',
      goal: 'Hold retention past twelve minutes and drive playlist views',
      status: 'awaiting_approval',
      version: 3,
      is_demo: true,
      created_at: minutesAgo(28),
      updated_at: minutesAgo(12),
    },
  ];
}

function youtubeVideos(): YoutubeVideo[] {
  const rows: Array<[number, string, YoutubeVideo['status'], number]> = [
    [1, 'The Road That Outlived Its Empire', 'published', 42],
    [2, 'The Storm That Changed a Language', 'published', 35],
    [3, 'Six Ships That Never Came Back', 'published', 28],
    [4, 'The Map That Was Wrong on Purpose', 'published', 21],
    [5, 'The Tomb Nobody Was Meant to Find', 'published', 14],
    [6, 'The Signal From an Empty Desert', 'production', 4],
    [7, 'The Computer That Was 1,400 Years Too Early', 'awaiting_approval', 2],
    [8, 'The Year Civilisation Almost Ended: 1177 BC', 'research', 0],
  ];
  const stageFor: Record<string, ProductionStage> = {
    published: 'publish',
    production: 'assets',
    awaiting_approval: 'script_approval',
    research: 'research',
  };
  return rows.map(([number, title, status, days]) =>
    newVideo({
      id: stableId(`video:${String(number).padStart(3, '0')}`),
      business_id: BUSINESS_IDS.youtube,
      channel_id: CHANNEL_ID,
      script_id: number === 7 ? stableId('script:007') : null,
      mission_id:
        number === 8 ? MISSION_IDS.video008 : number === 7 ? MISSION_IDS.video007 : null,
      number,
      title,
      status,
      stage: stageFor[status] ?? 'ideas',
      publish_at: status === 'published' ? daysAgo(days) : null,
      estimated_cost: status === 'published' ? 9.4 : 0,
      actual_cost: status === 'published' ? 9.4 : 0,
      is_demo: true,
      created_at: daysAgo(days + 10),
      updated_at: daysAgo(days),
    }),
  );
}

function thumbnailConcepts(): ThumbnailConcept[] {
  const seeds = [
    {
      title: 'The object alone',
      subject: 'The corroded main fragment, lit from one side',
      composition: 'Object hard right, negative space left for text',
      text: 'TOO EARLY',
      emotion: 'Unease',
      contrast: 'Warm bronze against near-black, single key light',
      psychology: 'The object is unfamiliar enough to create a question by itself.',
      confidence: 0.82,
    },
    {
      title: 'Exploded gearing',
      subject: 'Exploded diagram of the gear train',
      composition: 'Centred, radial symmetry',
      text: '2,000 YEARS',
      emotion: 'Curiosity',
      contrast: 'Cyan schematic lines on charcoal',
      psychology: 'Signals the video explains mechanism rather than retelling the discovery.',
      confidence: 0.74,
    },
    {
      title: 'The wreck',
      subject: 'Diver silhouette against a shaft of light, wreck below',
      composition: 'Vertical thirds, subject lower left',
      text: 'THE WRECK',
      emotion: 'Awe',
      contrast: 'Deep teal with a single warm highlight',
      psychology: 'Highest emotional pull, but risks promising an underwater documentary.',
      confidence: 0.61,
    },
    {
      title: 'Then and now',
      subject: 'Split frame: bronze gear beside a modern watch movement',
      composition: 'Hard vertical split',
      text: 'SAME IDEA',
      emotion: 'Recognition',
      contrast: 'Bronze against steel, equal luminance either side',
      psychology: 'The comparison does the explaining before a word is read.',
      confidence: 0.79,
    },
  ];
  return seeds.map((s, i) => ({
    id: stableId(`thumb:007:${i}`),
    business_id: BUSINESS_IDS.youtube,
    video_id: stableId('video:007'),
    script_id: stableId('script:007'),
    concept_title: s.title,
    visual_description: `${s.subject}. ${s.composition}.`,
    subject: s.subject,
    background: s.contrast,
    composition: s.composition,
    text: s.text,
    emotion: s.emotion,
    colour_direction: s.contrast,
    contrast_strategy: s.contrast,
    click_psychology: s.psychology,
    image_prompt: `${s.subject}, ${s.composition}, ${s.contrast}, cinematic documentary still, no text`,
    confidence: s.confidence,
    reasoning: s.psychology,
    asset_id: null,
    selected: false,
    is_demo: true,
    created_at: minutesAgo(40 - i),
  }));
}

function youtubeAnalytics(): YoutubeAnalytics[] {
  const videos = [1, 2, 3, 4, 5];
  const rows: YoutubeAnalytics[] = [];
  for (const n of videos) {
    const views = 18_000 + n * 9_400 + (n % 2) * 12_000;
    rows.push({
      id: stableId(`analytics:video:${n}`),
      business_id: BUSINESS_IDS.youtube,
      video_id: stableId(`video:${String(n).padStart(3, '0')}`),
      channel_id: CHANNEL_ID,
      date: daysAgo(45 - n * 7).slice(0, 10),
      views,
      impressions: Math.round(views * 14.2),
      ctr: Number((4.1 + n * 0.42).toFixed(2)),
      watch_time_minutes: Math.round(views * 7.4),
      average_view_duration_seconds: 430 + n * 26,
      likes: Math.round(views * 0.041),
      comments: Math.round(views * 0.0035),
      subscribers_gained: Math.round(views * 0.012),
      revenue: Number((views * 0.0042).toFixed(2)),
      is_demo: true,
    });
  }
  return rows;
}

function channelIntelligence(): ChannelIntelligence[] {
  return [
    {
      id: stableId('intel:1'),
      business_id: BUSINESS_IDS.youtube,
      channel_id: CHANNEL_ID,
      best_topics: [
        'Objects that predate their era',
        'Civilisational collapse',
        'Unresolved archaeological mysteries',
      ],
      best_title_structures: [
        '"The <noun> That <unexpected verb phrase>"',
        'Numeric specificity in the first four words',
      ],
      thumbnail_patterns: [
        'One subject, warm-on-dark contrast',
        'Two or three words maximum',
      ],
      ideal_duration: '15–19 minutes',
      retention_trends: [
        'Cold opens without branding hold roughly 8% more viewers at 30 seconds',
        'Retention dips sharply where narration exceeds 90 seconds without a visual change',
      ],
      best_publishing_periods: ['Thursday 18:00–20:00 UK', 'Sunday 10:00–12:00 UK'],
      generated_at: daysAgo(2),
      is_demo: true,
    },
  ];
}

/* ------------------------------------------------------------------ */
/* Etsy module data                                                    */
/* ------------------------------------------------------------------ */

const ETSY_STORE_ID = stableId('etsy-store:1');

function etsyStores(): EtsyStore[] {
  return [
    {
      id: ETSY_STORE_ID,
      business_id: BUSINESS_IDS.etsy,
      name: 'Quiet Paper Studio',
      url: 'https://www.etsy.com/shop/quietpaperstudio',
      niche: 'Printable planners and seasonal packs',
      external_id: null,
      is_demo: true,
      created_at: daysAgo(60),
    },
  ];
}

function etsyOpportunities(): EtsyOpportunity[] {
  const seeds = [
    {
      product: 'Ramadan Planner & Activity Pack',
      customer: 'Parents planning Ramadan for school-age children',
      problem: 'Existing packs are either religious-text heavy or aimed at toddlers',
      score: 89,
      status: 'approved' as const,
    },
    {
      product: 'ADHD-friendly Weekly Planner',
      customer: 'Adults who abandon conventional planners',
      problem: 'Standard planners assume linear time-blocking that does not fit',
      score: 84,
      status: 'proposed' as const,
    },
    {
      product: 'Small Business Tax Year Tracker (UK)',
      customer: 'UK sole traders filing self assessment',
      problem: 'US-centric templates use the wrong tax year and categories',
      score: 81,
      status: 'proposed' as const,
    },
    {
      product: 'Wedding Seating Chart Builder',
      customer: 'Couples planning without a planner',
      problem: 'Heavily saturated, but almost nothing editable in Canva',
      score: 58,
      status: 'rejected' as const,
    },
  ];
  return seeds.map((s, i) => ({
    id: stableId(`etsy-opp:${i}`),
    business_id: BUSINESS_IDS.etsy,
    store_id: ETSY_STORE_ID,
    mission_id: i === 0 ? MISSION_IDS.ramadan : null,
    task_id: null,
    product: s.product,
    target_customer: s.customer,
    problem: s.problem,
    demand: s.score > 80 ? 'Strong and rising into season' : 'Moderate',
    competition: s.score > 80 ? 'Moderate — few polished options' : 'Heavy',
    pricing_range: '£4.50 – £12.00',
    seasonality: i === 0 ? 'Peaks six weeks before Ramadan' : 'Year-round with January spike',
    production_difficulty: 'Moderate — 20–30 designed pages',
    seo_opportunity: 'Long-tail phrases with buyer intent are largely unclaimed',
    market_gap: s.problem,
    profit_potential: s.score > 80 ? 'High — digital delivery, no unit cost' : 'Modest',
    score: s.score,
    breakdown: {
      demand: s.score + 2,
      competition: s.score - 6,
      monetisation: s.score,
      longevity: s.score - 10,
      click_potential: s.score - 3,
    },
    status: s.status,
    is_demo: true,
    created_at: daysAgo(10 - i),
  }));
}

function etsyProducts(): EtsyProduct[] {
  return [
    {
      id: stableId('etsy-product:ramadan'),
      business_id: BUSINESS_IDS.etsy,
      store_id: ETSY_STORE_ID,
      opportunity_id: stableId('etsy-opp:0'),
      name: 'Ramadan Planner & Activity Pack',
      description:
        'A 32-page printable pack: daily reflection pages, a prayer tracker, a good-deeds chart and eight children’s activity sheets.',
      target_buyer: 'Parents planning Ramadan for school-age children',
      category: 'Paper & Party Supplies > Paper > Calendars & Planners',
      assets_required: ['32 designed pages', 'Cover mockup', '5 listing images', 'PDF export'],
      production_checklist: [
        { item: 'Page layout system', done: true },
        { item: 'Daily reflection pages', done: true },
        { item: 'Children’s activity sheets', done: true },
        { item: 'Listing images', done: false },
        { item: 'Final PDF export', done: false },
      ],
      price: 8.5,
      estimated_cost: 0,
      status: 'awaiting_approval',
      is_demo: true,
      created_at: daysAgo(9),
      updated_at: minutesAgo(32),
    },
    {
      id: stableId('etsy-product:adhd'),
      business_id: BUSINESS_IDS.etsy,
      store_id: ETSY_STORE_ID,
      opportunity_id: stableId('etsy-opp:1'),
      name: 'ADHD-friendly Weekly Planner',
      description: 'A non-linear weekly planner built around energy rather than hours.',
      target_buyer: 'Adults who abandon conventional planners',
      category: 'Paper & Party Supplies > Paper > Calendars & Planners',
      assets_required: ['12 designed pages', 'Cover mockup', '4 listing images'],
      production_checklist: [
        { item: 'Concept validation', done: true },
        { item: 'Page layout system', done: false },
      ],
      price: 6.0,
      estimated_cost: 0,
      status: 'creating',
      is_demo: true,
      created_at: daysAgo(5),
      updated_at: daysAgo(1),
    },
  ];
}

function etsyListings(): EtsyListing[] {
  return [
    {
      id: stableId('listing:ramadan'),
      business_id: BUSINESS_IDS.etsy,
      product_id: stableId('etsy-product:ramadan'),
      task_id: TASK_IDS.etsyListing,
      title: 'Ramadan Planner Printable Kids Activity Pack — 32 Pages Instant Download',
      description:
        'A calm, complete Ramadan pack for families. Thirty-two printable pages covering daily reflection, a prayer tracker, a good-deeds chart, and eight activity sheets for children aged 5–11.\n\nInstant digital download — nothing is posted.',
      tags: [
        'ramadan planner',
        'ramadan printable',
        'ramadan kids',
        'prayer tracker',
        'good deeds chart',
        'ramadan activities',
        'islamic printable',
        'ramadan calendar',
        'eid printable',
        'ramadan journal',
        'muslim kids',
        'ramadan pack',
        'instant download',
      ],
      keywords: ['ramadan planner printable', 'ramadan activities for kids', 'prayer tracker printable'],
      category_suggestions: ['Calendars & Planners', 'Digital Prints'],
      price_suggestion: 8.5,
      benefits: [
        'Everything for the month in one download',
        'Age-appropriate sheets for children',
        'Print at home on A4 or US Letter',
      ],
      faq: [
        { question: 'Is anything posted to me?', answer: 'No — this is an instant digital download.' },
        { question: 'What paper size?', answer: 'Both A4 and US Letter are included.' },
      ],
      image_brief:
        'Flat-lay of printed pages on a warm neutral surface, soft daylight, one lantern prop, no clutter.',
      status: 'awaiting_approval',
      is_demo: true,
      created_at: minutesAgo(32),
    },
  ];
}

function etsyKeywords(): EtsyKeyword[] {
  const seeds: Array<[string, string, string, number]> = [
    ['ramadan planner printable', 'High', 'Moderate', 0.96],
    ['ramadan activities for kids', 'High', 'Heavy', 0.91],
    ['prayer tracker printable', 'Moderate', 'Low', 0.88],
    ['good deeds chart printable', 'Low', 'Low', 0.79],
    ['ramadan calendar 2026', 'High', 'Heavy', 0.74],
    ['islamic printable for children', 'Moderate', 'Moderate', 0.71],
    ['adhd planner printable', 'Moderate', 'Moderate', 0.68],
    ['uk tax year tracker', 'Low', 'Low', 0.64],
  ];
  return seeds.map(([keyword, volume, competition, relevance], i) => ({
    id: stableId(`keyword:${i}`),
    business_id: BUSINESS_IDS.etsy,
    keyword,
    search_volume: volume,
    competition,
    relevance,
    is_demo: true,
    created_at: daysAgo(4),
  }));
}

/* ------------------------------------------------------------------ */
/* Finance                                                             */
/* ------------------------------------------------------------------ */

function financialTransactions(usage: ApiUsage[]): FinancialTransaction[] {
  const rows: FinancialTransaction[] = [];
  const push = (
    kind: FinancialTransaction['kind'],
    business: keyof typeof BUSINESS_IDS | null,
    category: string,
    description: string,
    amount: number,
    days: number,
  ) => {
    rows.push({
      id: stableId(`txn:${kind}:${category}:${description}:${days}`),
      owner_id: DEMO_OWNER_ID,
      business_id: business ? BUSINESS_IDS[business] : null,
      kind,
      category,
      description,
      amount,
      currency: 'GBP',
      occurred_at: daysAgo(days),
      reference_type: null,
      reference_id: null,
      is_demo: true,
      created_at: daysAgo(days),
    });
  };

  for (let d = 27; d >= 0; d -= 1) {
    push('revenue', 'youtube', 'AdSense', 'YouTube ad revenue', 78 + (d % 7) * 11, d);
    push('revenue', 'etsy', 'Sales', 'Etsy digital sales', 42 + (d % 5) * 14, d);
  }
  push('expense', 'youtube', 'Stock media', 'Archive footage licence', 89, 12);
  push('expense', 'etsy', 'Design tools', 'Design subscription', 29.99, 8);
  push('subscription', null, 'Software', 'Hosting and database', 24, 5);
  push('subscription', null, 'Software', 'Analytics tooling', 19, 5);

  // AI spend is never invented: it is derived from the recorded usage rows, so
  // the finance totals and the per-agent economics always agree.
  const byDay = new Map<string, number>();
  for (const row of usage) {
    const day = row.created_at.slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + row.estimated_cost);
  }
  for (const [day, amount] of byDay) {
    rows.push({
      id: stableId(`txn:ai:${day}`),
      owner_id: DEMO_OWNER_ID,
      business_id: null,
      kind: 'ai_cost',
      category: 'claude-sonnet-4-5',
      description: 'Agent execution',
      amount: Number(amount.toFixed(4)),
      currency: 'GBP',
      occurred_at: `${day}T12:00:00.000Z`,
      reference_type: null,
      reference_id: null,
      is_demo: true,
      created_at: `${day}T12:00:00.000Z`,
    });
  }
  return rows;
}

function apiUsage(): ApiUsage[] {
  const rows: ApiUsage[] = [];
  const agentIds = Object.values(AGENT_IDS);
  for (let d = 27; d >= 0; d -= 1) {
    for (let i = 0; i < 15; i += 1) {
      const agentId = agentIds[(d + i) % agentIds.length]!;
      const inputTokens = 42_000 + ((d * 1301 + i * 733) % 28_000);
      const outputTokens = 9_000 + ((d * 617 + i * 419) % 7_000);
      rows.push({
        id: stableId(`usage:${d}:${i}`),
        owner_id: DEMO_OWNER_ID,
        business_id: null,
        agent_id: agentId,
        task_id: null,
        provider: 'anthropic',
        model: 'claude-sonnet-4-5',
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        estimated_cost: Number(
          ((inputTokens / 1_000_000) * 3 + (outputTokens / 1_000_000) * 15).toFixed(5),
        ),
        duration_ms: 4200 + ((d * 3 + i) % 20000),
        is_demo: true,
        created_at: daysAgo(d),
      });
    }
  }
  return rows;
}

/* ------------------------------------------------------------------ */
/* Seeding                                                             */
/* ------------------------------------------------------------------ */

function profile(): Profile {
  return {
    id: DEMO_OWNER_ID,
    email: 'demo@commandcentre.local',
    display_name: 'Demo Operator',
    avatar_url: null,
    role: 'owner',
    timezone: 'Europe/London',
    currency: 'GBP',
    created_at: daysAgo(90),
    updated_at: now(),
  };
}

/**
 * Writes the full demo dataset. Every row carries `is_demo: true` so the UI can
 * label it honestly and a later "clear demo data" action can remove it cleanly.
 */
export async function seedDemoData(store: DataStore): Promise<void> {
  await store.insert('profiles', profile());
  await store.insertMany('source_resolutions', sourceResolutions());
  await store.insertMany('businesses', businesses());
  await store.insertMany('agents', agents());
  await store.insertMany('agent_memory', memory());
  await store.insertMany('workflow_definitions', WORKFLOW_DEFINITIONS);
  await store.insertMany('missions', missions());
  await store.insertMany('tasks', tasks());
  await store.insertMany('approvals', approvals());
  await store.insertMany('activity_logs', activity());
  await store.insertMany('notifications', notifications());
  await store.insertMany('command_messages', commandMessages());
  await store.insertMany('youtube_channels', youtubeChannels());
  await store.insertMany('youtube_ideas', youtubeIdeas());
  await store.insertMany('youtube_research', youtubeResearch());
  await store.insertMany('youtube_scripts', youtubeScripts());
  await store.insertMany('youtube_videos', youtubeVideos());
  await store.insertMany('youtube_thumbnail_concepts', thumbnailConcepts());
  await store.insertMany('youtube_analytics', youtubeAnalytics());
  await store.insertMany('youtube_channel_intelligence', channelIntelligence());
  await store.insertMany('etsy_stores', etsyStores());
  await store.insertMany('etsy_opportunities', etsyOpportunities());
  await store.insertMany('etsy_products', etsyProducts());
  await store.insertMany('etsy_listings', etsyListings());
  await store.insertMany('etsy_keywords', etsyKeywords());
  const usage = apiUsage();
  await store.insertMany('api_usage', usage);
  await store.insertMany('financial_transactions', financialTransactions(usage));
  await store.insertMany('integration_connections', resolveIntegrations(INTEGRATION_DEFINITIONS));

  // Link running tasks back to their agents so the galaxy reflects real state.
  const running = await store.list('tasks', { where: { status: ['running', 'approval'] } });
  for (const task of running) {
    if (task.agent_id) {
      await store.update('agents', task.agent_id, { current_task_id: task.id });
    }
  }
}
