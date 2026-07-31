import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryStore } from '@/lib/db/memory-store';
import { runAgent } from '@/lib/agents/engine';
import { handleCommand } from '@/lib/agents/manager';
import { createMission } from '@/lib/workflows/engine';
import { provisionWorkspace } from '@/lib/workspace/provision';
import { logActivity } from '@/lib/agents/activity';
import { WORKFLOW_DEFINITIONS } from '@/lib/workflows/definitions';
import { RlsMemoryStore } from './rls-store';
import { AGENT_SEEDS } from '@/lib/db/seed';
import { PERMISSIONS, can } from '@/lib/auth/permissions';
import {
  checkAiSpend,
  estimateCallCost,
  getAiBudget,
  monthStart,
  monthToDateSpend,
  setAiBudget,
} from '@/lib/finance/ai-budget';
import { uuid } from '@/lib/ids';
import { makePokemonWorkspace, OWNER_ID } from './helpers';

/**
 * Real mode is the mode where mistakes cost money and produce believable
 * fiction. Everything here is about the two failures that matter: silently
 * simulating output in a workspace the operator believes is real, and spending
 * against a limit nobody set.
 *
 * No real credential is ever used. Every test stubs the environment explicitly,
 * and the "real workspace" is only ever a stubbed Supabase URL — no network
 * call is made and no key of the operator's is read.
 */

const FAKE_SUPABASE_URL = 'https://example-project.supabase.co';
const FAKE_ANON_KEY = 'test-anon-key-not-a-real-credential';

/** A real workspace: storage configured, so nothing may be simulated. */
function realMode() {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', FAKE_SUPABASE_URL);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', FAKE_ANON_KEY);
}

/** Demo Mode: no storage, so simulation is allowed and free. */
function demoMode() {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
}

beforeEach(() => {
  demoMode();
  vi.stubEnv('ANTHROPIC_API_KEY', '');
  vi.stubEnv('DISABLE_SIMULATED_MEDIA', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

/* ------------------------------------------------------------------ */
/* No silent simulation                                                */
/* ------------------------------------------------------------------ */

describe('a real workspace never simulates', () => {
  it('stops the task and names what is missing when Anthropic is not connected', async () => {
    const { store } = await makePokemonWorkspace();
    const command = await handleCommand(store, OWNER_ID, 'Give me 5 Pokémon YouTube ideas.');
    const task = command.tasks[0]!;

    realMode();
    const result = await runAgent(store, OWNER_ID, task.id);

    expect(result.status).toBe('failed');
    expect(result.error).toMatch(/Anthropic is not connected/i);
    // The message has to be actionable, not just a refusal.
    expect(result.error).toMatch(/ANTHROPIC_API_KEY/);

    // And nothing invented was written.
    const rows = await store.list('pokemon_opportunities', {});
    expect(rows).toHaveLength(0);
  });

  it('records the failure on the task rather than leaving it looking fine', async () => {
    const { store } = await makePokemonWorkspace();
    const command = await handleCommand(store, OWNER_ID, 'Give me 5 Pokémon YouTube ideas.');
    realMode();
    await runAgent(store, OWNER_ID, command.tasks[0]!.id);

    const task = await store.get('tasks', command.tasks[0]!.id);
    expect(task!.status).toBe('failed');
    expect(task!.error).toMatch(/not connected/i);
    expect(task!.output).toBeNull();
  });

  it('still simulates in Demo Mode, so the pipeline can be exercised for free', async () => {
    const { store } = await makePokemonWorkspace();
    const command = await handleCommand(store, OWNER_ID, 'Give me 5 Pokémon YouTube ideas.');
    const result = await runAgent(store, OWNER_ID, command.tasks[0]!.id);

    expect(result.status).toBe('completed');
    expect(result.simulated).toBe(true);
    const rows = await store.list('pokemon_opportunities', {});
    expect(rows.every((row) => row.is_demo)).toBe(true);
  });

  it('refuses providers with no adapter rather than quietly using the mock', async () => {
    const { store, pokemonResearcher } = await makePokemonWorkspace();
    await store.update('agents', pokemonResearcher.id, { provider: 'openai' });
    const command = await handleCommand(store, OWNER_ID, 'Give me 5 Pokémon YouTube ideas.');

    realMode();
    const result = await runAgent(store, OWNER_ID, command.tasks[0]!.id);
    expect(result.status).toBe('failed');
    expect(result.error).toMatch(/OpenAI is not connected/i);
  });
});

/* ------------------------------------------------------------------ */
/* Spending controls                                                   */
/* ------------------------------------------------------------------ */

describe('AI spending controls', () => {
  it('refuses to spend at all until the owner has set a budget', async () => {
    const store = new MemoryStore();
    const decision = await checkAiSpend(store, OWNER_ID, { estimate: 0.01, missionId: null });

    expect(decision.allowed).toBe(false);
    expect(decision.notActivated).toBe(true);
    expect(decision.reason).toMatch(/no monthly ai budget/i);
    // No invented default anywhere.
    expect(decision.budget).toBeNull();
    expect(decision.remaining).toBeNull();
  });

  it('does not treat the demo production budget as a real AI budget', async () => {
    const { store } = await makePokemonWorkspace();
    // The demo ships a £250 figure in seeded memory and a £25 per-video
    // production budget. Neither is an account AI ceiling, and neither may
    // stand in for one.
    expect(await getAiBudget(store, OWNER_ID)).toBeNull();
    const decision = await checkAiSpend(store, OWNER_ID, { estimate: 0.01, missionId: null });
    expect(decision.notActivated).toBe(true);
  });

  it('stores figures without activating, so a budget can be drafted', async () => {
    const store = new MemoryStore();
    await setAiBudget(store, OWNER_ID, OWNER_ID, {
      currency: 'GBP',
      monthly_ceiling: 20,
      warn_at_percent: 80,
      per_mission_ceiling: 2,
      approval_over: 0.5,
      activate: false,
    });
    const decision = await checkAiSpend(store, OWNER_ID, { estimate: 0.01, missionId: null });
    expect(decision.allowed).toBe(false);
    expect(decision.notActivated).toBe(true);
  });

  it('allows a small call once a budget is set and activated', async () => {
    const store = new MemoryStore();
    await activate(store, { monthly_ceiling: 20, per_mission_ceiling: 2, approval_over: 0.5 });
    const decision = await checkAiSpend(store, OWNER_ID, { estimate: 0.01, missionId: null });
    expect(decision.allowed).toBe(true);
    expect(decision.remaining).toBeCloseTo(20, 5);
  });

  it('hard-stops at the monthly ceiling, and approval cannot override it', async () => {
    const store = new MemoryStore();
    await activate(store, { monthly_ceiling: 5, per_mission_ceiling: 5, approval_over: 100 });
    await recordSpend(store, 4.99);

    const decision = await checkAiSpend(store, OWNER_ID, { estimate: 0.5, missionId: null });
    expect(decision.allowed).toBe(false);
    expect(decision.exceedsCeiling).toBe(true);
    // Crucially: not an approval. There is no button that spends past this.
    expect(decision.requiresApproval).toBe(false);
    expect(decision.reason).toMatch(/monthly ceiling/i);
  });

  it('warns before it stops', async () => {
    const store = new MemoryStore();
    await activate(store, { monthly_ceiling: 10, per_mission_ceiling: 10, approval_over: 100 });
    await recordSpend(store, 8.5);

    const decision = await checkAiSpend(store, OWNER_ID, { estimate: 0.01, missionId: null });
    expect(decision.allowed).toBe(true);
    expect(decision.warning).toBe(true);
    expect(decision.reason).toMatch(/already spent/i);
  });

  it('stops a runaway mission before it spends the whole month', async () => {
    const store = new MemoryStore();
    await activate(store, { monthly_ceiling: 100, per_mission_ceiling: 1, approval_over: 100 });
    const missionId = uuid();
    await recordSpend(store, 0.95, missionId);

    const decision = await checkAiSpend(store, OWNER_ID, { estimate: 0.5, missionId });
    expect(decision.allowed).toBe(false);
    expect(decision.exceedsCeiling).toBe(true);
    expect(decision.reason).toMatch(/per-mission ceiling/i);
  });

  it('asks first for a single unusually expensive step', async () => {
    const store = new MemoryStore();
    await activate(store, { monthly_ceiling: 100, per_mission_ceiling: 50, approval_over: 0.25 });
    const decision = await checkAiSpend(store, OWNER_ID, { estimate: 0.3, missionId: null });
    expect(decision.allowed).toBe(false);
    expect(decision.requiresApproval).toBe(true);
    expect(decision.exceedsCeiling).toBe(false);
  });

  it('counts only this calendar month', async () => {
    const store = new MemoryStore();
    await activate(store, { monthly_ceiling: 10, per_mission_ceiling: 10, approval_over: 100 });
    // Last month's spend must not eat this month's budget.
    await recordSpend(store, 9, null, new Date(Date.parse(monthStart()) - 86_400_000).toISOString());
    expect(await monthToDateSpend(store, OWNER_ID)).toBe(0);
    const decision = await checkAiSpend(store, OWNER_ID, { estimate: 1, missionId: null });
    expect(decision.allowed).toBe(true);
  });

  it('estimates pessimistically, and never prices an unknown model as cheap', () => {
    const opus = estimateCallCost('claude-opus-4-1', 4096, 8000);
    const sonnet = estimateCallCost('claude-sonnet-4-5', 4096, 8000);
    const unknown = estimateCallCost('some-future-model', 4096, 8000);
    expect(opus).toBeGreaterThan(sonnet);
    // An unknown model is priced as the dearest, because guessing low is how a
    // ceiling gets passed.
    expect(unknown).toBe(opus);
    expect(sonnet).toBeGreaterThan(0);
  });
});

describe('an agent cannot raise its own ceiling', () => {
  it('keeps the AI budget permission with the owner alone', () => {
    expect(PERMISSIONS).toContain('ai_budget.manage');
    expect(can('owner', 'ai_budget.manage')).toBe(true);
    expect(can('admin', 'ai_budget.manage')).toBe(false);
    expect(can('member', 'ai_budget.manage')).toBe(false);
    expect(can('viewer', 'ai_budget.manage')).toBe(false);
  });

  it('gives no agent a capability that could reach the budget', () => {
    // Structural rather than aspirational: nothing in the seeded workforce
    // declares a capability whose handler could write this table.
    for (const seed of AGENT_SEEDS) {
      for (const capability of seed.capabilities) {
        expect(capability.startsWith('budget'), `${seed.name}: ${capability}`).toBe(false);
        expect(capability.includes('ai_budget'), `${seed.name}: ${capability}`).toBe(false);
      }
    }
  });
});

/* ------------------------------------------------------------------ */
/* Clean start                                                         */
/* ------------------------------------------------------------------ */

describe('a real workspace starts clean', () => {
  it('creates the workforce and no history at all', async () => {
    const store = new MemoryStore();
    const result = await provisionWorkspace(store, OWNER_ID);

    expect(result.agents).toBeGreaterThan(0);
    expect(result.businesses).toBe(3);

    // The things that must never be inherited from the demo.
    for (const table of [
      'missions',
      'tasks',
      'activity_logs',
      'approvals',
      'notifications',
      'agent_memory',
      'financial_transactions',
      'api_usage',
      'youtube_ideas',
      'youtube_videos',
      'youtube_analytics',
      'pokemon_opportunities',
    ] as const) {
      expect(await store.list(table, {}), table).toHaveLength(0);
    }
  });

  it('gives every agent a zeroed history rather than borrowed statistics', async () => {
    const store = new MemoryStore();
    await provisionWorkspace(store, OWNER_ID);
    const agents = await store.list('agents', {});
    for (const agent of agents) {
      expect(agent.tasks_completed, agent.name).toBe(0);
      expect(agent.tasks_failed, agent.name).toBe(0);
      expect(agent.estimated_total_cost, agent.name).toBe(0);
      expect(agent.last_run_at, agent.name).toBeNull();
      expect(agent.is_demo, agent.name).toBe(false);
      expect(agent.status, agent.name).toBe('idle');
    }
  });

  it('marks nothing it creates as demo data', async () => {
    const store = new MemoryStore();
    await provisionWorkspace(store, OWNER_ID);
    const businesses = await store.list('businesses', {});
    expect(businesses.every((business) => !business.is_demo)).toBe(true);
  });

  it('brings the Pokémon Researcher with it, so the first test can run', async () => {
    const store = new MemoryStore();
    await provisionWorkspace(store, OWNER_ID);
    const agents = await store.list('agents', {});
    const researcher = agents.find((agent) => agent.slug === 'pokemon-researcher');
    expect(researcher).toBeDefined();
    expect(researcher!.capabilities).toContain('pokemon.research.ideas');
  });

  it('is idempotent, so running it twice does not duplicate the workforce', async () => {
    const store = new MemoryStore();
    const first = await provisionWorkspace(store, OWNER_ID);
    const second = await provisionWorkspace(store, OWNER_ID);
    expect(second.alreadyProvisioned).toBe(true);
    expect(second.agents).toBe(0);
    expect(await store.list('agents', {})).toHaveLength(first.agents);
  });
});

/* ------------------------------------------------------------------ */
/* Persistence                                                         */
/* ------------------------------------------------------------------ */

describe('persistence', () => {
  it('keeps a mission, its tasks, output and cost in the store rather than in memory', async () => {
    const { store } = await makePokemonWorkspace();
    const command = await handleCommand(
      store,
      OWNER_ID,
      'Give me 10 Pokémon YouTube video ideas about unusual lore and TCG history.',
    );
    await runAgent(store, OWNER_ID, command.tasks[0]!.id);

    // Everything the operator would expect to still be there after a restart is
    // a row, not a variable.
    const missionId = command.mission!.id;
    expect(await store.get('missions', missionId)).toBeTruthy();
    const tasks = await store.list('tasks', { where: { mission_id: missionId } });
    expect(tasks.length).toBeGreaterThan(0);
    expect(tasks[0]!.output).toBeTruthy();

    const opportunities = await store.list('pokemon_opportunities', {
      where: { mission_id: missionId },
    });
    expect(opportunities.length).toBeGreaterThan(0);

    const usage = await store.list('api_usage', {});
    expect(usage.length).toBeGreaterThan(0);
    expect(usage[0]!.task_id).toBe(tasks[0]!.id);

    const activity = await store.list('activity_logs', { where: { mission_id: missionId } });
    expect(activity.length).toBeGreaterThan(0);
  });

  it('threads a task back to its mission, so nothing is orphaned on reload', async () => {
    const { store, business } = await makePokemonWorkspace();
    const created = await createMission(store, {
      ownerId: OWNER_ID,
      businessId: business.id,
      title: 'Persisted mission',
      objective: 'Check the wiring',
      workflowKey: null,
      steps: [
        {
          capability: 'pokemon.research.ideas',
          title: 'Research',
          description: 'Pokémon ideas',
          depends_on: [],
          requires_approval: false,
          input: {},
        },
      ],
      context: {},
    });
    const reloaded = await store.get('tasks', created.tasks[0]!.id);
    expect(reloaded!.mission_id).toBe(created.mission.id);
    expect(reloaded!.owner_id).toBe(OWNER_ID);
  });
});

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

async function activate(
  store: MemoryStore,
  figures: { monthly_ceiling: number; per_mission_ceiling: number; approval_over: number },
) {
  return setAiBudget(store, OWNER_ID, OWNER_ID, {
    currency: 'GBP',
    warn_at_percent: 80,
    activate: true,
    ...figures,
  });
}

/** Records spend the way the engine does: as an `api_usage` row. */
async function recordSpend(
  store: MemoryStore,
  amount: number,
  missionId: string | null = null,
  createdAt = new Date().toISOString(),
) {
  const taskId = uuid();
  if (missionId) {
    await store.insert('tasks', {
      id: taskId,
      owner_id: OWNER_ID,
      business_id: null,
      mission_id: missionId,
      agent_id: null,
      workflow_run_id: null,
      capability: 'pokemon.research.ideas',
      title: 'Spend',
      description: '',
      status: 'completed',
      priority: 'normal',
      progress: 100,
      input: {},
      output: null,
      error: null,
      retries: 0,
      max_retries: 1,
      started_at: createdAt,
      completed_at: createdAt,
      created_at: createdAt,
      updated_at: createdAt,
    } as never);
  }
  await store.insert('api_usage', {
    id: uuid(),
    owner_id: OWNER_ID,
    business_id: null,
    agent_id: null,
    task_id: missionId ? taskId : null,
    provider: 'anthropic',
    model: 'claude-sonnet-4-5',
    input_tokens: 1000,
    output_tokens: 1000,
    estimated_cost: amount,
    duration_ms: 1000,
    is_demo: false,
    created_at: createdAt,
  } as never);
}

/* ------------------------------------------------------------------ */
/* Provisioning under real Row Level Security                          */
/* ------------------------------------------------------------------ */

/**
 * These run against `RlsMemoryStore`, which enforces the policies the
 * migrations actually create rather than accepting every write.
 *
 * Provisioning shipped once with an insert into `workflow_definitions` — a
 * table whose shared, ownerless rows migration 0003 deliberately makes
 * read-only. `MemoryStore` accepted it, every test passed, and it failed the
 * first time a real operator clicked the button. That is the gap this closes.
 */
describe('provisioning a fresh real workspace under RLS', () => {
  it('completes without the database refusing a single write', async () => {
    const store = new RlsMemoryStore(OWNER_ID);
    const result = await provisionWorkspace(store, OWNER_ID);

    expect(result.alreadyProvisioned).toBe(false);
    expect(result.businesses).toBe(3);
    expect(result.agents).toBeGreaterThan(0);
  });

  it('writes nothing into the shared workflow library', async () => {
    const store = new RlsMemoryStore(OWNER_ID);
    await provisionWorkspace(store, OWNER_ID);
    // Built-in workflows are code, resolved through findWorkflow. The table is
    // for owner-created workflows, and provisioning creates none.
    expect(await store.list('workflow_definitions', {})).toHaveLength(0);
  });

  it('still runs a mission afterwards, because workflows come from code', async () => {
    const store = new RlsMemoryStore(OWNER_ID);
    await provisionWorkspace(store, OWNER_ID);

    // The end-to-end proof that the removed insert was never load-bearing: a
    // workflow-driven mission plans correctly with an empty table.
    const businesses = await store.list('businesses', { where: { owner_id: OWNER_ID } });
    const youtube = businesses.find((business) => business.slug === 'youtube')!;
    const created = await createMission(store, {
      ownerId: OWNER_ID,
      businessId: youtube.id,
      title: 'Pokémon video',
      objective: 'Check the workflow resolves',
      workflowKey: 'pokemon_youtube_video',
    });
    // Twelve steps, resolved from the code definition, with the first assigned
    // to the Pokémon Researcher the provisioner just created.
    expect(created.tasks.length).toBeGreaterThan(1);
    expect(created.tasks[0]!.step_key).toBe('research');

    const agents = await store.list('agents', { where: { owner_id: OWNER_ID } });
    const researcher = agents.find((agent) => agent.slug === 'pokemon-researcher')!;
    expect(created.tasks[0]!.agent_id).toBe(researcher.id);
  });

  it('still refuses an ownerless workflow row, so the library stays immutable', async () => {
    const store = new RlsMemoryStore(OWNER_ID);
    await expect(
      store.insert('workflow_definitions', {
        ...WORKFLOW_DEFINITIONS[0]!,
        id: uuid(),
      }),
    ).rejects.toThrow(/row-level security/i);
  });

  it('refuses a workflow row belonging to somebody else', async () => {
    const store = new RlsMemoryStore(OWNER_ID);
    await expect(
      store.insert('workflow_definitions', {
        ...WORKFLOW_DEFINITIONS[0]!,
        id: uuid(),
        owner_id: uuid(),
      }),
    ).rejects.toThrow(/row-level security/i);
  });

  it('allows the owner their own custom workflow, which is what the table is for', async () => {
    const store = new RlsMemoryStore(OWNER_ID);
    const row = await store.insert('workflow_definitions', {
      ...WORKFLOW_DEFINITIONS[0]!,
      id: uuid(),
      owner_id: OWNER_ID,
      key: 'my_custom_workflow',
    });
    expect(row.owner_id).toBe(OWNER_ID);
  });

  it('keeps every provisioned row inside the owner, so isolation holds', async () => {
    const store = new RlsMemoryStore(OWNER_ID);
    await provisionWorkspace(store, OWNER_ID);

    for (const table of [
      'businesses',
      'agents',
      'production_budgets',
      'production_settings',
      'source_policies',
      'visual_rules',
    ] as const) {
      const rows = await store.list(table, {});
      expect(rows.length, table).toBeGreaterThan(0);
      for (const row of rows) {
        expect((row as { owner_id: string }).owner_id, table).toBe(OWNER_ID);
      }
    }
  });

  it('refuses a write for a different owner, so the double is genuinely enforcing', async () => {
    // Guards the guard: a policy double that accepted everything would make
    // every test above meaningless.
    const store = new RlsMemoryStore(OWNER_ID);
    await expect(
      provisionWorkspace(store, uuid()),
    ).rejects.toThrow(/row-level security/i);
  });

  it('is idempotent under RLS too, creating nothing on a second run', async () => {
    const store = new RlsMemoryStore(OWNER_ID);
    const first = await provisionWorkspace(store, OWNER_ID);
    const second = await provisionWorkspace(store, OWNER_ID);

    expect(second.alreadyProvisioned).toBe(true);
    expect(second.agents).toBe(0);
    expect(second.businesses).toBe(0);
    expect(await store.list('agents', {})).toHaveLength(first.agents);
    expect(await store.list('businesses', {})).toHaveLength(first.businesses);
  });

  it('finishes on a retry after a partial run, rather than duplicating', async () => {
    // A crash between the businesses and the agents leaves a workspace with
    // channels and no workforce. Clicking setup again must complete it, not
    // create a second set of channels.
    const store = new RlsMemoryStore(OWNER_ID);
    await provisionWorkspace(store, OWNER_ID, { include: ['youtube'] });
    const afterFirst = await store.list('businesses', {});

    // Simulate the crash: drop the agents, keep the channel.
    for (const agent of await store.list('agents', {})) {
      await store.remove('agents', agent.id);
    }

    const retry = await provisionWorkspace(store, OWNER_ID, { include: ['youtube'] });
    expect(retry.businesses).toBe(0);
    expect(retry.agents).toBeGreaterThan(0);
    expect(await store.list('businesses', {})).toHaveLength(afterFirst.length);
  });

  it('logs the setup activity the route writes, without a policy refusal', async () => {
    const store = new RlsMemoryStore(OWNER_ID);
    await provisionWorkspace(store, OWNER_ID);
    // The route logs this immediately afterwards; activity_logs is owner-scoped
    // and the row carries nulls for business, mission, task and agent.
    await logActivity(store, {
      ownerId: OWNER_ID,
      businessId: null,
      missionId: null,
      taskId: null,
      agentId: null,
      kind: 'system',
      message: 'Workspace set up',
      metadata: {},
    });
    const logs = await store.list('activity_logs', {});
    expect(logs).toHaveLength(1);
    expect(logs[0]!.owner_id).toBe(OWNER_ID);
  });
});
