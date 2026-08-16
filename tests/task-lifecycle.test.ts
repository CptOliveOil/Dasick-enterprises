import { beforeEach, describe, expect, it, vi } from 'vitest';
import { uuid } from '@/lib/ids';
import { createMission } from '@/lib/workflows/engine';
import { runMission } from '@/lib/workflows/runner';
import { runAgent } from '@/lib/agents/engine';
import { provisionWorkspace } from '@/lib/workspace/provision';
import { startOperationalReadiness } from '@/lib/workflows/readiness';
import { RlsMemoryStore } from './rls-store';
import { OWNER_ID } from './helpers';

/**
 * A real workspace's Operational Readiness children got stuck at 0/1,
 * "Running", for hours. Root cause, traced end to end against
 * `RlsMemoryStore`:
 *
 * A task with no assigned agent — which happens whenever a required agent
 * (here, the Readiness Auditor, added to AGENT_SEEDS after some real
 * accounts were already provisioned) is missing from the workspace — was
 * created `status: 'queued'` with `agent_id: null` and a pre-filled `error`
 * naming the gap, exactly as designed. But `runAgent()` refused it with a
 * raw `throw` *before* its own try/catch began, and `runMission()`'s loop
 * called `runAgent()` with no try/catch of its own. The throw propagated
 * out of `runMission()` entirely, which meant `recomputeMission()` — the
 * only place that would ever have flipped this task to a terminal `failed`
 * state — was never reached. The task stayed `queued` forever.
 *
 * Compounding it: `deriveMissionState()` mapped "nothing running, but
 * something queued" to mission status `running`, so a mission that had
 * *never executed a single task* displayed identically to one genuinely in
 * progress. And when this happened inside `Promise.all(missions.map(runMission))`
 * (`app/api/command/route.ts`), the one throw aborted the whole batch response
 * — an unrelated sibling mission's failure taking down the request that was
 * meant to report on all of them.
 */
beforeEach(() => {
  vi.stubEnv('ANTHROPIC_API_KEY', '');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
});

describe('a task with no assigned agent', () => {
  it('fails cleanly instead of throwing an unhandled error runMission cannot catch', async () => {
    const store = new RlsMemoryStore(OWNER_ID);
    await provisionWorkspace(store, OWNER_ID);
    // A disabled agent is still provisioned — this is the genuine "no
    // eligible agent" case, not the drift `reconcileGlobalAgents` backfills
    // (see the test below), and must still fail cleanly rather than get
    // silently re-enabled.
    const agents = await store.list('agents', { where: { owner_id: OWNER_ID } });
    const auditor = agents.find((a) => a.slug === 'readiness-auditor')!;
    await store.update('agents', auditor.id, { status: 'disabled' });

    const { parent, children } = await startOperationalReadiness(store, OWNER_ID);
    const infra = children.find((c) => c.business_id === null)!;

    // This must never throw — the reported bug was exactly this call
    // propagating an unhandled error out of runMission.
    const run = await runMission(store, OWNER_ID, infra.id);
    expect(run.status).toBe('failed');
    expect(run.haltedBecause).toMatch(/no available agent/i);

    const task = (await store.list('tasks', { where: { mission_id: infra.id } }))[0]!;
    expect(task.status).toBe('failed');
    expect(task.error).toMatch(/no available agent/i);

    // The rest of the batch (the other children, the parent) must be
    // unaffected — this is what makes it safe inside `Promise.all`.
    for (const child of children) {
      if (child.id === infra.id) continue;
      await expect(runMission(store, OWNER_ID, child.id)).resolves.toBeTruthy();
    }
    await expect(runMission(store, OWNER_ID, parent.id)).resolves.toBeTruthy();
  });
});

describe('an account provisioned before a global agent existed in AGENT_SEEDS', () => {
  it('backfills the missing agent the first time a capability needs it, and completes', async () => {
    const store = new RlsMemoryStore(OWNER_ID);
    await provisionWorkspace(store, OWNER_ID);

    // Simulate exactly what a real, already-provisioned account looks like:
    // `provisionWorkspace` never runs its full seed again, so an account
    // provisioned before the Readiness Auditor existed simply never has it.
    const before = await store.list('agents', { where: { owner_id: OWNER_ID } });
    const auditor = before.find((a) => a.slug === 'readiness-auditor')!;
    await store.remove('agents', auditor.id);
    expect(before.some((a) => a.slug === 'readiness-auditor')).toBe(true);

    const { children } = await startOperationalReadiness(store, OWNER_ID);
    const infra = children.find((c) => c.business_id === null)!;

    // `createMission`, via `resolveAgentForCapability`, backfills the
    // missing global agent on the spot rather than creating a task with
    // `agent_id: null` for something that was only ever provisioning drift.
    const backfilled = await store.list('agents', { where: { owner_id: OWNER_ID } });
    expect(backfilled.filter((a) => a.slug === 'readiness-auditor')).toHaveLength(1);

    const run = await runMission(store, OWNER_ID, infra.id);
    expect(run.status).toBe('completed');
  });

  it('never duplicates an agent that already exists, and touches nothing else on the account', async () => {
    const store = new RlsMemoryStore(OWNER_ID);
    await provisionWorkspace(store, OWNER_ID);
    const firstPass = await store.list('agents', { where: { owner_id: OWNER_ID } });
    const businessesBefore = await store.list('businesses', { where: { owner_id: OWNER_ID } });

    // Re-provisioning an already-provisioned, fully-intact account must be a
    // pure no-op: no second Manager, no duplicated businesses.
    const result = await provisionWorkspace(store, OWNER_ID);
    expect(result.alreadyProvisioned).toBe(true);
    expect(result.agents).toBe(0);
    expect(result.businesses).toBe(0);

    const secondPass = await store.list('agents', { where: { owner_id: OWNER_ID } });
    expect(secondPass).toHaveLength(firstPass.length);
    const businessesAfter = await store.list('businesses', { where: { owner_id: OWNER_ID } });
    expect(businessesAfter).toHaveLength(businessesBefore.length);
  });
});
