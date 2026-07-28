import 'server-only';
import { uuid } from '@/lib/ids';
import type { DataStore } from '@/lib/db/tables';
import { getProvider, providerIsLive } from '@/lib/integrations/ai';
import { managerPlanSchema, type ManagerPlan } from '@/schemas/manager';
import type { Business, CommandMessage, Mission, Task } from '@/types/domain';
import { listCapabilities } from './capabilities';
import { createMission, type PlannedStep } from '@/lib/workflows/engine';

export interface CommandResult {
  mission: Mission | null;
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

  const valid = plan ? sanitisePlan(plan, available) : null;
  const finalPlan = valid ?? routeLocally(trimmed, businesses, available);

  if (!finalPlan) {
    const reply =
      'I could not match that to any capability the current workforce has. Try naming the business, or add an agent that covers the work.';
    const managerMessage = await appendManagerMessage(store, ownerId, reply, null, {});
    return {
      mission: null,
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

  const { mission, tasks } = await createMission(store, {
    ownerId,
    businessId: business?.id ?? null,
    title: finalPlan.mission_title,
    objective: finalPlan.objective,
    workflowKey: finalPlan.workflow,
    steps,
    context: { instruction: trimmed },
  });

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
    tasks,
    reply: finalPlan.reply,
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
    'Reusable workflows you may name in `workflow`: youtube_video, youtube_ideas, youtube_script, etsy_product, channel_analysis. Use null when none fits.',
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
  business: 'youtube' | 'etsy' | null;
  build: (instruction: string) => Omit<ManagerPlan, 'business'>;
}

function n(instruction: string, fallback: number): number {
  const match = instruction.match(/\b(\d{1,2})\b/);
  const value = match ? Number(match[1]) : fallback;
  return Number.isFinite(value) && value > 0 && value <= 25 ? value : fallback;
}

const ROUTES: Route[] = [
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
    match: /(prepare|produce|create|make|new).*(video|youtube)|youtube video/i,
    business: 'youtube',
    build: (instruction) => ({
      mission_title: 'Produce a YouTube video',
      objective: `Take a video from idea through research, script, fact check, thumbnails and a production plan. Instruction: "${instruction}"`,
      workflow: 'youtube_video',
      reply:
        'Mission created. The YouTube Researcher starts on ideas, then the Scriptwriter and Fact Checker take over. Three approvals will be required before production begins.',
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
): ManagerPlan | null {
  const route = ROUTES.find((r) => r.match.test(instruction));
  if (!route) return null;

  const built = route.build(instruction);
  const business = route.business
    ? (businesses.find((b) => b.slug === route.business)?.slug ?? null)
    : null;

  const plan: ManagerPlan = { ...built, business };
  if (plan.steps.length > 0) {
    const usable = plan.steps.filter((s) => available.has(s.capability));
    if (usable.length === 0) return null;
    plan.steps = usable;
  } else if (!plan.workflow) {
    return null;
  }
  return plan;
}
