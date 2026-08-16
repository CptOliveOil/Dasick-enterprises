import { beforeEach, describe, expect, it, vi } from 'vitest';
import { uuid } from '@/lib/ids';
import { MemoryStore } from '@/lib/db/memory-store';
import { createMission, resolveRunWorkflow } from '@/lib/workflows/engine';
import { WORKFLOW_DEFINITIONS } from '@/lib/workflows/definitions';
import { provisionWorkspace } from '@/lib/workspace/provision';
import { startOperationalReadiness } from '@/lib/workflows/readiness';
import { RlsMemoryStore } from './rls-store';
import { OWNER_ID } from './helpers';

/**
 * `workflow_runs.workflow_definition_id` used to be `not null references
 * workflow_definitions(id)`. Built-in workflows are code
 * (`WORKFLOW_DEFINITIONS`), deliberately never rows in that table — so the
 * first mission built from one, against a real database, failed:
 *
 *   workflow_runs: insert or update on table "workflow_runs" violates
 *   foreign key constraint "workflow_runs_workflow_definition_id_fkey"
 *
 * `RlsMemoryStore` (tests/rls-store.ts) enforces that same foreign key —
 * transcribed from migration 0011, not invented for this file — so these
 * tests reproduce the exact failure under the exact conditions it happened
 * under: `MemoryStore` alone never would, which is precisely how the bug
 * shipped unnoticed through 524 passing tests the first time.
 */
beforeEach(() => {
  vi.stubEnv('ANTHROPIC_API_KEY', '');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
});

describe('reproducing the reported failure', () => {
  it('a workflow_runs row naming a workflow_definitions row that does not exist is refused, verbatim', async () => {
    const store = new RlsMemoryStore(OWNER_ID);
    // A mission is needed to pass the RLS half of the check first —
    // provisioning alone creates none.
    const missionId = (await makeMission(store)).id;

    await expect(
      store.insert('workflow_runs', {
        id: uuid(),
        mission_id: missionId,
        // Exactly what the old code wrote: a built-in's code-only id, as if
        // it were a real database row.
        workflow_definition_id: WORKFLOW_DEFINITIONS[0]!.id,
        workflow_key: null,
        status: 'planning',
        step_tasks: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
    ).rejects.toThrow(
      /workflow_runs.*violates foreign key constraint "workflow_runs_workflow_definition_id_fkey"/,
    );
  });
});

describe('a built-in workflow mission', () => {
  it('creates no fake workflow_definitions row and writes workflow_key instead', async () => {
    const store = new RlsMemoryStore(OWNER_ID);
    await provisionWorkspace(store, OWNER_ID);
    const businesses = await store.list('businesses', { where: { owner_id: OWNER_ID } });
    const youtube = businesses.find((b) => b.slug === 'youtube')!;

    const { mission } = await createMission(store, {
      ownerId: OWNER_ID,
      businessId: youtube.id,
      title: 'A video',
      objective: 'x',
      workflowKey: 'youtube_video_full',
    });

    const runs = await store.list('workflow_runs', { where: { mission_id: mission.id } });
    expect(runs).toHaveLength(1);
    expect(runs[0]!.workflow_definition_id).toBeNull();
    expect(runs[0]!.workflow_key).toBe('youtube_video_full');

    const resolved = await resolveRunWorkflow(store, runs[0]!);
    expect(resolved?.key).toBe('youtube_video_full');
  });

  it('readiness children (business_readiness, system_readiness) also create cleanly under the same constraint', async () => {
    const store = new RlsMemoryStore(OWNER_ID);
    await provisionWorkspace(store, OWNER_ID);

    // This is the exact call that failed in production.
    const { parent, children } = await startOperationalReadiness(store, OWNER_ID);
    expect(parent.business_id).toBeNull();
    expect(children.length).toBeGreaterThan(1);

    for (const child of children) {
      const runs = await store.list('workflow_runs', { where: { mission_id: child.id } });
      expect(runs).toHaveLength(1);
      expect(runs[0]!.workflow_definition_id).toBeNull();
      expect(['business_readiness', 'system_readiness']).toContain(runs[0]!.workflow_key);
    }
  });
});

describe('a custom, database-defined workflow', () => {
  it('keeps a real workflow_definition_id, because it is a real row', async () => {
    const store = new RlsMemoryStore(OWNER_ID);
    await provisionWorkspace(store, OWNER_ID);
    const businesses = await store.list('businesses', { where: { owner_id: OWNER_ID } });
    const youtube = businesses.find((b) => b.slug === 'youtube')!;

    const custom = await store.insert('workflow_definitions', {
      ...WORKFLOW_DEFINITIONS.find((w) => w.key === 'youtube_ideas')!,
      id: uuid(),
      owner_id: OWNER_ID,
      key: 'my_custom_ideas_run',
    });

    const { mission } = await createMission(store, {
      ownerId: OWNER_ID,
      businessId: youtube.id,
      title: 'Custom workflow run',
      objective: 'x',
      workflowKey: 'my_custom_ideas_run',
    });

    const runs = await store.list('workflow_runs', { where: { mission_id: mission.id } });
    expect(runs[0]!.workflow_definition_id).toBe(custom.id);
    expect(runs[0]!.workflow_key).toBe('my_custom_ideas_run');

    const resolved = await resolveRunWorkflow(store, runs[0]!);
    expect(resolved?.id).toBe(custom.id);
  });
});

describe('retries', () => {
  it('leave the workflow_runs row — and what it resolves to — untouched', async () => {
    const store = new RlsMemoryStore(OWNER_ID);
    await provisionWorkspace(store, OWNER_ID);
    const businesses = await store.list('businesses', { where: { owner_id: OWNER_ID } });
    const youtube = businesses.find((b) => b.slug === 'youtube')!;

    const { mission, tasks } = await createMission(store, {
      ownerId: OWNER_ID,
      businessId: youtube.id,
      title: 'A video',
      objective: 'x',
      workflowKey: 'youtube_ideas',
    });
    const before = (await store.list('workflow_runs', { where: { mission_id: mission.id } }))[0]!;

    // The same reset a retry performs (app/api/missions/[id]/control/route.ts,
    // `retry_task`) — never touches workflow_runs at all.
    await store.update('tasks', tasks[0]!.id, {
      status: 'queued',
      error: null,
      output: null,
      started_at: null,
      completed_at: null,
    });

    const after = (await store.list('workflow_runs', { where: { mission_id: mission.id } }))[0]!;
    expect(after).toEqual(before);
    const resolved = await resolveRunWorkflow(store, after);
    expect(resolved?.key).toBe('youtube_ideas');
  });
});

describe('existing workflow runs written before this migration', () => {
  it('remain resolvable with no backfill, by matching the old id against the built-in list', async () => {
    const store = new MemoryStore();
    const missionId = (await makeMission(store)).id;
    const builtIn = WORKFLOW_DEFINITIONS.find((w) => w.key === 'etsy_product_build')!;

    // The exact shape a pre-0011 row has: no workflow_key column value, and a
    // workflow_definition_id that was always a code-only hash for a built-in.
    const oldRun = await store.insert('workflow_runs', {
      id: uuid(),
      mission_id: missionId,
      workflow_definition_id: builtIn.id,
      workflow_key: null,
      status: 'completed',
      step_tasks: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const resolved = await resolveRunWorkflow(store, oldRun);
    expect(resolved?.key).toBe('etsy_product_build');
  });
});

async function makeMission(store: MemoryStore | RlsMemoryStore) {
  const business = await store.insert('businesses', {
    id: uuid(),
    owner_id: OWNER_ID,
    name: 'Fixture business',
    slug: `fixture-${uuid().slice(0, 8)}`,
    kind: 'generic',
    description: '',
    colour: '#000000',
    currency: 'GBP',
    is_demo: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  return store.insert('missions', {
    id: uuid(),
    owner_id: OWNER_ID,
    business_id: business.id,
    parent_mission_id: null,
    number: 1,
    title: 'Fixture mission',
    objective: '',
    status: 'running',
    priority: 'normal',
    target_date: null,
    target_time: null,
    workflow_definition_id: null,
    context: {},
    progress: 0,
    is_demo: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    completed_at: null,
  });
}
