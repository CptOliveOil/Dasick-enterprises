import 'server-only';
import { uuid } from '@/lib/ids';
import { newAgent } from '@/lib/agents/factory';
import { defaultBudget, defaultProductionSettings } from '@/lib/production/defaults';
import { defaultSourcePolicy, defaultVisualRules } from '@/lib/islamic/policy';
import { WORKFLOW_DEFINITIONS } from '@/lib/workflows/definitions';
import { AGENT_SEEDS, type AgentSeed } from '@/lib/db/seed';
import type { DataStore } from '@/lib/db/tables';
import type { Business } from '@/types/domain';

/**
 * Gives a real workspace its workforce, and nothing else.
 *
 * A fresh Supabase account is genuinely empty: no businesses, no agents, so no
 * capability the router can reach and nothing to run. This creates the same
 * roster the demo ships with — the agents themselves, their capabilities, their
 * prompts, their planets — and deliberately none of the story around them.
 *
 * What is **not** copied, and must never be: missions, tasks, activity,
 * approvals, notifications, agent memory, analytics, videos, scripts, ideas,
 * research, financial transactions and API usage. Those are the demo's
 * invented history. Carrying them into a real workspace would put fake revenue
 * in the operator's finances, fake costs against a real budget and fake
 * performance figures against real agents — numbers that look exactly like
 * measurements and are not.
 *
 * Counters start at zero for the same reason. A brand-new agent that claims 184
 * completed tasks and a 98% success rate is lying about work it has never done.
 */

export interface ProvisionResult {
  businesses: number;
  agents: number;
  workflows: number;
  /** True when the workspace already had agents and nothing was created. */
  alreadyProvisioned: boolean;
}

/** The channels the built-in workforce is organised around. */
const BUSINESS_TEMPLATES: {
  key: 'youtube' | 'etsy' | 'islamic';
  name: string;
  slug: string;
  kind: Business['kind'];
  description: string;
  colour: string;
}[] = [
  {
    key: 'youtube',
    name: 'YouTube',
    slug: 'youtube',
    kind: 'youtube',
    description: 'Faceless documentary channel.',
    colour: '#ef4444',
  },
  {
    key: 'etsy',
    name: 'Etsy',
    slug: 'etsy',
    kind: 'etsy',
    description: 'Digital product store — printables, planners and templates.',
    colour: '#f97316',
  },
  {
    key: 'islamic',
    name: 'Islamic Channel',
    slug: 'islamic-channel',
    kind: 'youtube',
    description:
      'Sourced Islamic educational content — Seerah, stories of the Prophets, Qur’an study and Islamic history.',
    colour: '#0f766e',
  },
];

export interface ProvisionOptions {
  /** Channels to create. Omit one and its agents are skipped with it. */
  include?: ('youtube' | 'etsy' | 'islamic')[];
  currency?: string;
}

/**
 * Idempotent by design: if the workspace already has agents, this does nothing
 * and says so. Running it twice must never produce a second Manager competing
 * with the first for the same work.
 */
export async function provisionWorkspace(
  store: DataStore,
  ownerId: string,
  options: ProvisionOptions = {},
): Promise<ProvisionResult> {
  const include = new Set(options.include ?? ['youtube', 'etsy', 'islamic']);
  const currency = options.currency ?? 'GBP';

  const existingAgents = await store.list('agents', { where: { owner_id: ownerId } });
  if (existingAgents.length > 0) {
    return {
      businesses: 0,
      agents: 0,
      workflows: 0,
      alreadyProvisioned: true,
    };
  }

  const timestamp = new Date().toISOString();

  // Workflow definitions are shared, ownerless rows. Insert them only if this
  // database has not already got them.
  const existingWorkflows = await store.list('workflow_definitions', {});
  let workflows = 0;
  if (existingWorkflows.length === 0) {
    await store.insertMany('workflow_definitions', WORKFLOW_DEFINITIONS);
    workflows = WORKFLOW_DEFINITIONS.length;
  }

  const existingBusinesses = await store.list('businesses', { where: { owner_id: ownerId } });
  const byKey = new Map<string, string>();
  for (const existing of existingBusinesses) {
    const template = BUSINESS_TEMPLATES.find((item) => item.slug === existing.slug);
    if (template) byKey.set(template.key, existing.id);
  }

  let created = 0;
  for (const template of BUSINESS_TEMPLATES) {
    if (!include.has(template.key) || byKey.has(template.key)) continue;
    const business: Business = {
      id: uuid(),
      owner_id: ownerId,
      name: template.name,
      slug: template.slug,
      kind: template.kind,
      description: template.description,
      colour: template.colour,
      currency,
      is_demo: false,
      created_at: timestamp,
      updated_at: timestamp,
    };
    await store.insert('businesses', business);
    byKey.set(template.key, business.id);
    created += 1;

    // A production budget and settings row per channel, at the conservative
    // defaults. These cap what one video may cost in media providers; the
    // account-level AI ceiling is set separately by the owner and has no
    // default at all.
    await store.insert('production_budgets', defaultBudget(ownerId, business.id, currency));
    await store.insert(
      'production_settings',
      defaultProductionSettings(ownerId, business.id, null),
    );

    if (template.key === 'islamic') {
      await store.insert('source_policies', defaultSourcePolicy(ownerId, business.id));
      await store.insert('visual_rules', defaultVisualRules(ownerId, business.id));
    }
  }

  const agents = AGENT_SEEDS.filter(
    (seed) => seed.business === null || include.has(seed.business),
  ).map((seed) => blankAgent(seed, ownerId, byKey, timestamp));

  if (agents.length > 0) await store.insertMany('agents', agents);

  return {
    businesses: created,
    agents: agents.length,
    workflows,
    alreadyProvisioned: false,
  };
}

/**
 * One agent, with its identity and none of the demo's invented history.
 *
 * Everything descriptive comes from the seed; everything that reads as a
 * measurement is zeroed. `status` is forced to idle rather than copied, because
 * the seed's statuses describe a demo mid-flight and a new agent has not
 * started anything.
 */
function blankAgent(
  seed: AgentSeed,
  ownerId: string,
  businessIds: Map<string, string>,
  timestamp: string,
) {
  return newAgent({
    owner_id: ownerId,
    business_id: seed.business ? (businessIds.get(seed.business) ?? null) : null,
    name: seed.name,
    slug: seed.slug,
    role: seed.role,
    description: seed.description,
    system_prompt: seed.system_prompt,
    status: 'idle',
    authority_level: seed.authority_level,
    capabilities: seed.capabilities,
    agent_type: seed.agent_type,
    template_key: seed.template_key ?? null,
    is_custom: false,
    visual: seed.visual,
    is_demo: false,
    tasks_completed: 0,
    tasks_failed: 0,
    average_execution_time: 0,
    estimated_total_cost: 0,
    last_run_at: null,
    created_at: timestamp,
    updated_at: timestamp,
  });
}
