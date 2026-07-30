import 'server-only';
import { uuid } from '@/lib/ids';
import type { DataStore } from '@/lib/db/tables';
import { getProvider, providerIsLive } from '@/lib/integrations/ai';
import { managerPlanSchema, type ManagerPlan } from '@/schemas/manager';
import type { Agent, Business, CommandMessage, Mission, Task } from '@/types/domain';
import { listCapabilities } from './capabilities';
import { createMission, type PlannedStep } from '@/lib/workflows/engine';

export interface CommandResult {
  /** The first mission created. Kept for callers that expect a single one. */
  mission: Mission | null;
  /** Every mission this command created — more than one for bulk requests. */
  missions: Mission[];
  tasks: Task[];
  reply: string;
  plan: ManagerPlan | null;
  messages: CommandMessage[];
  /** True when the plan came from a keyword router rather than a live model. */
  planned_locally: boolean;
}

const MANAGER_SLUG = 'commander';

/**
 * Turns an operator instruction into a mission.
 *
 * With a live AI provider the Commander plans it. Without one, a deterministic
 * keyword router produces a sensible plan so the system still does real work
 * instead of pretending.
 */
export async function handleCommand(
  store: DataStore,
  ownerId: string,
  instruction: string,
): Promise<CommandResult> {
  const trimmed = instruction.trim();
  if (trimmed.length === 0) throw new Error('Say what you want the workforce to do.');

  const timestamp = new Date().toISOString();
  const userMessage: CommandMessage = {
    id: uuid(),
    owner_id: ownerId,
    role: 'user',
    content: trimmed,
    mission_id: null,
    refs: {},
    created_at: timestamp,
  };
  await store.insert('command_messages', userMessage);

  const businesses = await store.list('businesses', { where: { owner_id: ownerId } });
  const agents = await store.list('agents', { where: { owner_id: ownerId } });
  const available = new Set(agents.flatMap((a) => a.capabilities));
  const capabilities = listCapabilities().filter((c) => available.has(c.capability));

  const manager = agents.find((a) => a.slug === MANAGER_SLUG) ?? null;
  const live = manager ? providerIsLive(manager.provider) : false;

  let plan: ManagerPlan | null = null;
  let plannedLocally = true;

  if (manager && live) {
    try {
      plan = await planWithModel(store, manager, trimmed, businesses, capabilities);
      plannedLocally = false;
    } catch {
      // A planning failure should not lose the instruction — fall through.
      plan = null;
    }
  }

  const islamicBusinessSlug = findIslamicBusiness(businesses, agents);

  const valid = plan ? sanitisePlan(plan, available) : null;
  const finalPlan = valid ?? routeLocally(trimmed, businesses, available, islamicBusinessSlug);

  if (!finalPlan) {
    const reply =
      'I could not match that to any capability the current workforce has. Try naming the business, or add an agent that covers the work.';
    const managerMessage = await appendManagerMessage(store, ownerId, reply, null, {});
    return {
      mission: null,
      missions: [],
      tasks: [],
      reply,
      plan: null,
      messages: [userMessage, managerMessage],
      planned_locally: true,
    };
  }

  const business = finalPlan.business
    ? (businesses.find((b) => b.slug === finalPlan.business) ?? null)
    : null;

  const steps: PlannedStep[] = finalPlan.steps.map((step, index) => ({
    capability: step.capability,
    title: step.title,
    description: step.description,
    depends_on: step.depends_on.filter((d) => d < index),
    requires_approval: step.requires_approval,
    input: step.input as Record<string, unknown>,
  }));

  // Bulk requests become separate missions, so each video has its own cost,
  // approvals, assets and failure modes.
  const repeat = Math.max(1, Math.min(finalPlan.repeat ?? 1, 10));
  const missions: Mission[] = [];
  const tasks: Task[] = [];

  for (let index = 0; index < repeat; index += 1) {
    const created = await createMission(store, {
      ownerId,
      businessId: business?.id ?? null,
      title: repeat > 1 ? `${finalPlan.mission_title} (${index + 1} of ${repeat})` : finalPlan.mission_title,
      objective: finalPlan.objective,
      workflowKey: finalPlan.workflow,
      steps,
      context: { instruction: trimmed, batch_index: index, batch_size: repeat },
    });
    missions.push(created.mission);
    tasks.push(...created.tasks);
  }

  const mission = missions[0]!;
  await store.update('command_messages', userMessage.id, { mission_id: mission.id });

  const managerMessage = await appendManagerMessage(
    store,
    ownerId,
    finalPlan.reply,
    mission.id,
    {
      tasks: tasks.map((t) => t.id),
      agents: tasks.map((t) => t.agent_id).filter((id): id is string => Boolean(id)),
    },
  );

  return {
    mission,
    missions,
    tasks,
    reply:
      repeat > 1
        ? `${finalPlan.reply} I have created ${repeat} separate missions so each one has its own budget, approvals and assets.`
        : finalPlan.reply,
    plan: finalPlan,
    messages: [{ ...userMessage, mission_id: mission.id }, managerMessage],
    planned_locally: plannedLocally,
  };
}

async function appendManagerMessage(
  store: DataStore,
  ownerId: string,
  content: string,
  missionId: string | null,
  refs: CommandMessage['refs'],
): Promise<CommandMessage> {
  return store.insert('command_messages', {
    id: uuid(),
    owner_id: ownerId,
    role: 'manager',
    content,
    mission_id: missionId,
    refs,
    created_at: new Date().toISOString(),
  });
}

async function planWithModel(
  store: DataStore,
  manager: { provider: Parameters<typeof getProvider>[0]; model: string; system_prompt: string; temperature: number; max_tokens: number },
  instruction: string,
  businesses: Business[],
  capabilities: { capability: string; label: string }[],
): Promise<ManagerPlan> {
  const provider = getProvider(manager.provider);
  const prompt = [
    'The operator has given you an instruction. Produce a plan.',
    '',
    `Instruction: "${instruction}"`,
    '',
    'Businesses available:',
    ...businesses.map((b) => `- slug "${b.slug}": ${b.name} — ${b.description}`),
    '',
    'Capabilities the workforce actually has. You may only use these:',
    ...capabilities.map((c) => `- ${c.capability}: ${c.label}`),
    '',
    'Reusable workflows you may name in `workflow`: youtube_video_full (the complete faceless video pipeline — prefer this for "make a video"), islamic_youtube_video, islamic_research, youtube_ideas, youtube_script, youtube_video, etsy_product, channel_analysis. Use null when none fits.',
    'If the operator asks for several videos, set `repeat` to that number rather than adding more steps. Each repeat becomes its own mission.',
    '',
    'Islamic work:',
    '- Use the islamic.* capabilities and the islamic_* workflows only when the subject matter is genuinely Islamic — Qur\'an, hadith, Seerah, fiqh, Islamic history, Ramadan, and so on.',
    '- Do not route ordinary YouTube or Etsy work through them. A general history video does not need a religious source check, and sending it through one wastes a step and pollutes that channel\'s memory.',
    '- When you do use them, set `business` to the slug of the channel whose agents hold those capabilities.',
    '',
    'Rules:',
    '- Every step must use a capability from the list above, verbatim.',
    '- Set `requires_approval` on any step whose output the operator should see before work continues.',
    '- `depends_on` holds indices of earlier steps in your own array.',
    '- `reply` is what the operator reads: say what you created, who is doing what, and how many approvals to expect. Two or three sentences.',
    '- Put concrete parameters the agent needs into `input` (for example: count, niche, audience).',
  ].join('\n');

  const result = await provider.generateStructured({
    system: manager.system_prompt,
    prompt,
    model: manager.model,
    temperature: 0.3,
    maxTokens: manager.max_tokens,
    schema: managerPlanSchema,
    schemaName: 'ManagerPlan',
  });

  void store;
  return result.data;
}

/** Drops steps referencing capabilities no agent provides. */
function sanitisePlan(plan: ManagerPlan, available: Set<string>): ManagerPlan | null {
  const kept: ManagerPlan['steps'] = [];
  const indexMap = new Map<number, number>();
  plan.steps.forEach((step, index) => {
    if (!available.has(step.capability)) return;
    indexMap.set(index, kept.length);
    kept.push(step);
  });
  if (kept.length === 0) return null;

  return {
    ...plan,
    steps: kept.map((step) => ({
      ...step,
      depends_on: step.depends_on
        .map((d) => indexMap.get(d))
        .filter((d): d is number => d !== undefined),
    })),
  };
}

/* ------------------------------------------------------------------ */
/* Local routing                                                       */
/* ------------------------------------------------------------------ */

interface Route {
  match: RegExp;
  /** A slug the plan should be scoped to. */
  business: string | null;
  /**
   * An extra subject-matter test the instruction must pass.
   *
   * Matching the shape of a request is not enough for a specialist. "Make a
   * video" looks identical whether the subject is Islamic history, Pokémon lore
   * or anything else, and sending it to the wrong specialist is worse than
   * having no specialist: it adds steps the work does not need and fills that
   * agent's memory with a subject it does not serve.
   */
  subject?: (instruction: string) => boolean;
  /** The route is only viable when some agent actually provides this. */
  requiresCapability?: string;
  /**
   * Scope to whichever channel actually holds the Islamic capabilities, rather
   * than to a hard-coded slug.
   */
  islamicChannel?: boolean;
  build: (instruction: string) => Omit<ManagerPlan, 'business' | 'repeat'>;
}

/**
 * Words that indicate genuinely Islamic subject matter.
 *
 * Deliberately specific. Routing every YouTube task through the Islamic
 * specialists would be worse than not having them: a history video would be
 * slowed by a source check it does not need, and the Islamic agents' memory
 * would fill with material from a channel they do not serve.
 */
const ISLAMIC_SUBJECT =
  /\b(islam(ic|ically)?|muslim|qur['’]?an(ic)?|quran(ic)?|surah?|surat|ayah?|ayat|hadith|ahadith|sunnah|seerah|sirah|prophet\s+(muhammad|yusuf|musa|isa|ibrahim|nuh|adam|yunus|ayyub|sulaiman|dawud)|prophets?\b.*\bstor(y|ies)|sahaba|companions\s+of\s+the\s+prophet|salah|salat|prayer\s+in\s+islam|ramadan|ramadhan|eid|zakat|zakah|hajj|umrah|dhikr|du['’]?a|dua|tawakkul|taqwa|iman|fiqh|madhhab|madhab|sharia|shariah|tafsir|tajweed|khutbah|masjid|mosque|caliph|khalifa|scholar.*\b(islam|muslim)|allah)\b/i;

function isIslamic(instruction: string): boolean {
  return ISLAMIC_SUBJECT.test(instruction);
}

/**
 * Words that mean the subject really is Pokémon.
 *
 * Deliberately franchise-specific. "TCG" and "cards" on their own are not
 * enough — a Magic: The Gathering question is not this agent's work — so the
 * instruction has to name the franchise, one of its regions, or one of its
 * characters before a Pokémon route will take it.
 */
const POKEMON_SUBJECT =
  /\b(pok[eé]mon|pok[eé]dex|pok[eé]\s?ball|pikachu|charizard|charmander|bulbasaur|squirtle|eevee|mewtwo|snorlax|gengar|lucario|greninja|umbreon|rayquaza|arceus|magikarp|gyarados|dragonite|blastoise|venusaur|team\s+rocket|gym\s+leader|kanto|johto|hoenn|sinnoh|unova|kalos|alola|galar|paldea)\b/i;

function isPokemon(instruction: string): boolean {
  return POKEMON_SUBJECT.test(instruction);
}

/**
 * "Create a faceless video about …" and nothing looser.
 *
 * The article is load-bearing. Without it, "topics that could make good videos"
 * reads as a request to produce a video, and a request for research would build
 * a fifteen-step production mission instead.
 */
const MAKE_ONE_VIDEO =
  /\b(create|make|produce|prepare|build)\s+(?:me\s+)?(?:a|an|one|another)\s+(?:new\s+|faceless\s+|youtube\s+|full\s+|long[- ]form\s+)*(video|documentary|short)\b/i;

/** "Create 3 videos this week" → 3. Anything unbounded falls back to one. */
function countVideos(instruction: string): number {
  const digits = instruction.match(/\b(\d{1,2})\s+(?:more\s+)?(?:youtube\s+)?videos?\b/i);
  if (digits) {
    const value = Number(digits[1]);
    if (value >= 1 && value <= 10) return value;
  }
  const words: Record<string, number> = { two: 2, three: 3, four: 4, five: 5 };
  const word = instruction.match(/\b(two|three|four|five)\s+(?:youtube\s+)?videos?\b/i);
  if (word) return words[word[1]!.toLowerCase()] ?? 1;
  return 1;
}

/** Pulls the subject out of "make a video about X" for the mission title. */
function topicOf(instruction: string): string {
  const match = instruction.match(/\babout\s+(.+?)\s*[.!?]?$/i);
  if (!match) return '';
  return match[1]!.trim().replace(/^the\s+/i, '').slice(0, 70);
}

function n(instruction: string, fallback: number): number {
  const match = instruction.match(/\b(\d{1,2})\b/);
  const value = match ? Number(match[1]) : fallback;
  return Number.isFinite(value) && value > 0 && value <= 25 ? value : fallback;
}

const ROUTES: Route[] = [
  // Islamic routes come first, so an instruction that is clearly religious in
  // subject reaches the specialists rather than falling into the general
  // YouTube routes below. Each still requires the capability to exist.
  {
    match: /(check|verify|is\s+(the|this)).*(hadith|hadeeth|narration|ayah|verse|citation|source|authentic)/i,
    business: null,
    requiresCapability: 'islamic.source_verify',
    subject: isIslamic,
    islamicChannel: true,
    build: (instruction) => ({
      mission_title: 'Verify religious sources',
      objective: `Check the religious sources in this material. Instruction: "${instruction}"`,
      workflow: null,
      reply:
        'Mission created. The Islamic Source Checker is reviewing the citations, gradings and attributions now. Anything it marks incorrect or questionable stops there and comes to you.',
      steps: [
        {
          capability: 'islamic.source_verify',
          title: 'Verify religious sources',
          description: instruction,
          depends_on: [],
          requires_approval: false,
          input: { instructions: instruction },
        },
      ],
    }),
  },
  {
    match: /(review|check).*(script|draft).*(islam|accuracy|religio)|islamic\s+(accuracy|review)/i,
    business: null,
    requiresCapability: 'islamic.script_review',
    subject: isIslamic,
    islamicChannel: true,
    build: (instruction) => ({
      mission_title: 'Islamic script review',
      objective: `Review a script for Islamic accuracy. Instruction: "${instruction}"`,
      workflow: null,
      reply:
        'Mission created. The Islamic Source Checker is reviewing the script for citation accuracy, hadith grading and attributed positions.',
      steps: [
        {
          capability: 'islamic.script_review',
          title: 'Review script for Islamic accuracy',
          description: instruction,
          depends_on: [],
          requires_approval: false,
          input: { instructions: instruction },
        },
      ],
    }),
  },
  {
    // A full Islamic video: research and verification first, then the ordinary
    // production pipeline.
    match: /(create|make|produce|prepare|new|build).*(video|documentary|short)/i,
    business: null,
    requiresCapability: 'islamic.research',
    subject: isIslamic,
    islamicChannel: true,
    build: (instruction) => ({
      mission_title: `Islamic video${topicOf(instruction) ? `: ${topicOf(instruction)}` : ''}`,
      objective: `Research, verify and produce an Islamic educational video. Instruction: "${instruction}"`,
      workflow: 'islamic_youtube_video',
      reply:
        'Mission created on the Islamic channel. The Islamic Researcher builds a source-classified package, the Source Checker verifies it before anything is written, then the Scriptwriter drafts and the Source Checker reviews the script again. ' +
        'I will stop for your approval on the script before any production work or spending begins — after that the existing production agents take it through to a rendered video and a final approval.',
      steps: [],
    }),
  },
  {
    match: /(idea|topic|content plan|plan).*(islam|muslim|ramadan|quran|hadith|seerah|salah)|islamic.*(idea|content)/i,
    business: null,
    requiresCapability: 'islamic.content_plan',
    subject: isIslamic,
    islamicChannel: true,
    build: (instruction) => ({
      mission_title: 'Plan Islamic content',
      objective: `Plan Islamic educational content. Instruction: "${instruction}"`,
      workflow: null,
      reply: `Mission created. The Islamic Researcher is planning ${n(instruction, 8)} ideas, each with the sourcing it will need and any sensitivities noted. They appear under Ideas.`,
      steps: [
        {
          capability: 'islamic.content_plan',
          title: `Plan ${n(instruction, 8)} Islamic content ideas`,
          description: instruction,
          depends_on: [],
          requires_approval: false,
          input: { count: n(instruction, 8), instructions: instruction },
        },
      ],
    }),
  },
  {
    match: /(research|explain|about|study).*(islam|muslim|quran|qur'an|surah|ayah|hadith|seerah|prophet|ramadan|salah|dua|tawakkul|fiqh)/i,
    business: null,
    requiresCapability: 'islamic.research',
    subject: isIslamic,
    islamicChannel: true,
    build: (instruction) => ({
      mission_title: `Islamic research${topicOf(instruction) ? `: ${topicOf(instruction)}` : ''}`,
      objective: `Research an Islamic topic and verify its sources. Instruction: "${instruction}"`,
      workflow: 'islamic_research',
      reply:
        'Mission created. The Islamic Researcher is preparing a source-classified package, then the Source Checker verifies it and brings it to you for approval.',
      steps: [],
    }),
  },
  // Pokémon routes sit ahead of the general YouTube and Etsy routes so a
  // Pokémon instruction reaches the specialist rather than the generalist, and
  // behind the Islamic ones, which are gated on a subject these cannot match.
  // Each still requires the capability to exist, so removing the agent removes
  // the routes with it.
  {
    // Product research first: it is the narrowest reading, and an instruction
    // that mentions Etsy is not asking for a video.
    match: /\b(etsy|product|printable|print[- ]on[- ]demand|merch|sticker|poster|shop|store|listing|sell|selling)\b/i,
    business: 'etsy',
    subject: isPokemon,
    requiresCapability: 'pokemon.etsy.opportunities',
    build: (instruction) => ({
      mission_title: `Pokémon product research${topicOf(instruction) ? `: ${topicOf(instruction)}` : ''}`,
      objective: `Research Pokémon-related product demand and assess what we could legitimately sell. Instruction: "${instruction}"`,
      workflow: null,
      reply:
        `Mission created. The Pokémon Researcher is looking for ${n(instruction, 6)} product opportunities. ` +
        'It reports demand honestly, including where the demand is for artwork and characters we hold no licence to sell — ' +
        'anything in that category is flagged for your approval with what is protected and an original direction that keeps the buyer.',
      steps: [
        {
          capability: 'pokemon.etsy.opportunities',
          title: `Research ${n(instruction, 6)} Pokémon product opportunities`,
          description: instruction,
          depends_on: [],
          requires_approval: false,
          input: { count: n(instruction, 6), instructions: instruction },
        },
      ],
    }),
  },
  {
    // A full video, when the instruction genuinely asks for one to be made.
    match: MAKE_ONE_VIDEO,
    business: 'youtube',
    subject: isPokemon,
    requiresCapability: 'pokemon.research.ideas',
    build: (instruction) => ({
      mission_title: `Pokémon video${topicOf(instruction) ? `: ${topicOf(instruction)}` : ''}`,
      objective: `Research and produce a faceless Pokémon video. Instruction: "${instruction}"`,
      workflow: 'pokemon_youtube_video',
      reply:
        'Mission created. The Pokémon Researcher goes first and hands its research to the Scriptwriter, then the Fact Checker. ' +
        'I will stop for your approval on the script before any production work or spending begins — after that the existing ' +
        'Voiceover Agent, Visual Director, Asset Agent, Thumbnail Strategist and Video Producer take it through to a rendered video, ' +
        'and Quality Control brings it back to you for final approval.',
      steps: [],
    }),
  },
  {
    // Card work. Ahead of the general ideas route so "TCG topics that could
    // make good videos" lands on the card research rather than on ideas.
    match: /\b(card|cards|tcg|trading\s+card|booster|holo|holographic|rarity|set|sets|print\s+run|graded|collecting|collector)\b/i,
    business: 'youtube',
    subject: isPokemon,
    requiresCapability: 'pokemon.tcg.research',
    build: (instruction) => ({
      mission_title: `Pokémon card research${topicOf(instruction) ? `: ${topicOf(instruction)}` : ''}`,
      objective: `Research Pokémon trading card history and find topics that could carry a video. Instruction: "${instruction}"`,
      workflow: null,
      reply:
        `Mission created. The Pokémon Researcher is working through ${n(instruction, 8)} card topics — set history, rarity systems, print runs and collecting stories. ` +
        'It will not quote prices, valuations or grading populations: nothing here is connected to a live market, so any topic that needs those is marked as needing a source rather than answered from memory.',
      steps: [
        {
          capability: 'pokemon.tcg.research',
          title: `Research ${n(instruction, 8)} Pokémon card topics`,
          description: instruction,
          depends_on: [],
          requires_approval: false,
          input: { count: n(instruction, 8), instructions: instruction },
        },
      ],
    }),
  },
  {
    // Everything else about Pokémon that is asking for research or ideas.
    // Deliberately not a catch-all: an analytics question about a Pokémon
    // channel still belongs to the Analyst.
    match: /\b(idea|ideas|topic|topics|opportunit|research|find|suggest|mystery|mysteries|lore|history|histories|fact|facts|ranking|rankings|retrospective|forgotten|obscure|controvers|story|stories|explain|deep\s?dive)\b/i,
    business: 'youtube',
    subject: isPokemon,
    requiresCapability: 'pokemon.research.ideas',
    build: (instruction) => ({
      mission_title: `Pokémon content research${topicOf(instruction) ? `: ${topicOf(instruction)}` : ''}`,
      objective: `Find Pokémon content opportunities for faceless video. Instruction: "${instruction}"`,
      workflow: null,
      reply:
        `Mission created. The Pokémon Researcher is finding ${n(instruction, 10)} opportunities across lore, mysteries, game and anime history, cards and collecting. ` +
        'Each one comes back with a hook, who it is for, how long it should run and what has to be established before a word is written.',
      steps: [
        {
          capability: 'pokemon.research.ideas',
          title: `Research ${n(instruction, 10)} Pokémon content opportunities`,
          description: instruction,
          depends_on: [],
          requires_approval: false,
          input: { count: n(instruction, 10), instructions: instruction },
        },
      ],
    }),
  },
  {
    match: /(idea|opportunit|topic|niche).*(video|youtube)|(video|youtube).*(idea|opportunit|topic)/i,
    business: 'youtube',
    build: (instruction) => ({
      mission_title: 'Find YouTube video opportunities',
      objective: `Generate and score video opportunities. Instruction: "${instruction}"`,
      workflow: 'youtube_ideas',
      reply: `Mission created. The YouTube Researcher is generating ${n(instruction, 10)} scored opportunities now. They will appear under YouTube → Ideas for you to approve or reject.`,
      steps: [
        {
          capability: 'youtube.research.ideas',
          title: `Research ${n(instruction, 10)} video opportunities`,
          description: instruction,
          depends_on: [],
          requires_approval: false,
          input: { count: n(instruction, 10), instructions: instruction },
        },
      ],
    }),
  },
  {
    // The headline command: a full faceless video, end to end.
    match: /(prepare|produce|create|make|new|finish).*(faceless|video|documentary)|youtube video|about the/i,
    business: 'youtube',
    build: (instruction) => ({
      mission_title: `Produce a faceless video${topicOf(instruction) ? `: ${topicOf(instruction)}` : ''}`,
      objective: `Take a video from research through script, fact check, narration, visuals, assets, thumbnail, metadata, assembly and quality control, to a package ready for publishing. Instruction: "${instruction}"`,
      workflow: 'youtube_video_full',
      reply:
        'Mission created. Research and the Scriptwriter start now, then the Fact Checker. ' +
        'I will stop for your approval on the script before any production work or spending begins — ' +
        'after that the Voiceover Agent, Visual Director, Asset Agent, Thumbnail Strategist and Video Producer take it through to a rendered video, ' +
        'and Quality Control brings it back to you for final approval.',
      steps: [],
    }),
  },
  {
    match: /(continue|resume|carry on).*(production|video|mission)/i,
    business: 'youtube',
    build: (instruction) => ({
      mission_title: 'Continue production',
      objective: `Continue an existing production. Instruction: "${instruction}"`,
      workflow: null,
      reply:
        'To continue a specific video, open it in YouTube → Production and use the production actions, or resume its mission from the Missions area. I have not created a duplicate mission.',
      steps: [],
    }),
  },
  {
    match: /(script|write).*(video|youtube)/i,
    business: 'youtube',
    build: (instruction) => ({
      mission_title: 'Write a video script',
      objective: `Research and script a video. Instruction: "${instruction}"`,
      workflow: 'youtube_script',
      reply:
        'Mission created. Research runs first, then the Scriptwriter drafts, then the Fact Checker verifies. You will be asked to approve the script.',
      steps: [],
    }),
  },
  {
    match: /(analys|analyz|perform|why.*(video|channel)|retention|ctr)/i,
    business: 'youtube',
    build: (instruction) => ({
      mission_title: 'Analyse channel performance',
      objective: `Analyse recorded channel analytics. Instruction: "${instruction}"`,
      workflow: 'channel_analysis',
      reply:
        'Mission created. The YouTube Analyst is working through recorded analytics and will refresh Channel Intelligence.',
      steps: [],
    }),
  },
  {
    match: /etsy|printable|digital product|listing/i,
    business: 'etsy',
    build: (instruction) => ({
      mission_title: 'Find Etsy product opportunities',
      objective: `Research digital product opportunities. Instruction: "${instruction}"`,
      workflow: null,
      reply: `Mission created. The Etsy Researcher is finding ${n(instruction, 6)} scored product opportunities. They will appear under Etsy → Opportunities.`,
      steps: [
        {
          capability: 'etsy.research.opportunities',
          title: `Research ${n(instruction, 6)} product opportunities`,
          description: instruction,
          depends_on: [],
          requires_approval: false,
          input: { count: n(instruction, 6), instructions: instruction },
        },
      ],
    }),
  },
  {
    match: /keyword|seo|search term|discoverab/i,
    business: null,
    build: (instruction) => ({
      mission_title: 'Keyword research',
      objective: `Research keywords. Instruction: "${instruction}"`,
      workflow: null,
      reply: 'Mission created. The SEO Agent is researching keywords now.',
      steps: [
        {
          capability: 'seo.keywords',
          title: 'Research keywords',
          description: instruction,
          depends_on: [],
          requires_approval: false,
          input: { subject: instruction },
        },
      ],
    }),
  },
];

/**
 * Keyword router used when no live model is available, and as a safety net when
 * the model produces a plan the workforce cannot execute.
 */
function routeLocally(
  instruction: string,
  businesses: Business[],
  available: Set<string>,
  islamicBusinessSlug: string | null,
): ManagerPlan | null {
  const route = ROUTES.find((candidate) => {
    if (!candidate.match.test(instruction)) return false;
    // A specialist route applies only when the subject really is its subject
    // *and* an agent exists that can do the work. Either alone is not enough: a
    // general history video must not be slowed by a religious source check it
    // does not need, and a route with no agent behind it would create a stalled
    // mission nobody can run.
    if (candidate.subject && !candidate.subject(instruction)) return false;
    if (candidate.requiresCapability && !available.has(candidate.requiresCapability)) {
      return false;
    }
    if (candidate.islamicChannel && !islamicBusinessSlug) return false;
    return true;
  });
  if (!route) return null;

  const built = route.build(instruction);
  const repeat = countVideos(instruction);
  const business = route.islamicChannel
    ? islamicBusinessSlug
    : route.business
      ? (businesses.find((b) => b.slug === route.business)?.slug ?? null)
      : null;

  const plan: ManagerPlan = { ...built, business, repeat };
  if (plan.steps.length > 0) {
    const usable = plan.steps.filter((s) => available.has(s.capability));
    if (usable.length === 0) return null;
    plan.steps = usable;
  } else if (!plan.workflow) {
    return null;
  }
  return plan;
}

/**
 * The business whose own workforce can do Islamic work.
 *
 * Resolved from the agents actually assigned to it, not from a name — the
 * operator may call their channel anything, and an agent scoped to a different
 * channel must not be borrowed for it.
 */
function findIslamicBusiness(businesses: Business[], agents: Agent[]): string | null {
  const withIslamicAgents = businesses.find((business) =>
    agents.some(
      (agent) =>
        agent.business_id === business.id &&
        !agent.archived_at &&
        agent.status !== 'disabled' &&
        agent.capabilities.some((capability) => capability.startsWith('islamic.')),
    ),
  );
  return withIslamicAgents?.slug ?? null;
}
