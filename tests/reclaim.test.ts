import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reclaimStaleTasks } from '@/lib/workflows/reclaim';
import { recomputeMission } from '@/lib/workflows/engine';
import { runMission } from '@/lib/workflows/runner';
import { startOperationalReadiness } from '@/lib/workflows/readiness';
import { getCapabilityHandler } from '@/lib/agents/capabilities';
import { makeReadinessWorkspace, OWNER_ID } from './helpers';

/**
 * Stale-task recovery. There is no background worker anywhere in this
 * system — every task runs synchronously inside whatever request called
 * `runAgent`/`runMission`. A task can only be `running` because that
 * request marked it so, so a task still `running` with no heartbeat inside
 * its capability's expected window was orphaned by that request dying
 * (a dev-server restart, a crashed container), not by genuinely slow work.
 * These tests exercise `reclaimStaleTasks` directly and through the paths
 * that call it (`runMission`, mission retry).
 */
beforeEach(() => {
  vi.stubEnv('ANTHROPIC_API_KEY', '');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
});

describe('a readiness child task, claimed and completed', () => {
  it('moves through created → queued → claimed → running → completed with every timestamp set', async () => {
    const { store, youtube } = await makeReadinessWorkspace();
    const { children } = await startOperationalReadiness(store, OWNER_ID);
    const child = children.find((c) => c.business_id === youtube.id)!;

    const beforeRun = (await store.list('tasks', { where: { mission_id: child.id } }))[0]!;
    expect(beforeRun.status).toBe('queued');
    expect(beforeRun.claimed_at).toBeNull();
    expect(beforeRun.heartbeat_at).toBeNull();

    await runMission(store, OWNER_ID, child.id);

    const after = await store.get('tasks', beforeRun.id);
    expect(after!.status).toBe('completed');
    expect(after!.claimed_at).not.toBeNull();
    expect(after!.heartbeat_at).not.toBeNull();
    expect(after!.started_at).not.toBeNull();
    expect(after!.completed_at).not.toBeNull();
    expect(after!.reclaim_count).toBe(0);
  });
});

describe('server restart between queue and execution', () => {
  it('a task that was only ever queued survives being picked up in a later, unrelated call', async () => {
    const { store, youtube } = await makeReadinessWorkspace();
    const { children } = await startOperationalReadiness(store, OWNER_ID);
    const child = children.find((c) => c.business_id === youtube.id)!;

    // Nothing about the process that created this mission is still around —
    // the store is the only thing that ever needs to survive. A fresh
    // `runMission` call, as if issued by an entirely new request after a
    // restart, is enough to pick the task up and finish it.
    const run = await runMission(store, OWNER_ID, child.id);
    expect(run.status).toBe('completed');
  });
});

describe('stale running task recovery', () => {
  it('reclaims a running task whose heartbeat has gone quiet past its capability window', async () => {
    const { store, youtube } = await makeReadinessWorkspace();
    const { children } = await startOperationalReadiness(store, OWNER_ID);
    const child = children.find((c) => c.business_id === youtube.id)!;
    const task = (await store.list('tasks', { where: { mission_id: child.id } }))[0]!;

    // Simulate a process that started this task and died mid-way: `running`,
    // with a heartbeat well past the fast-capability window readiness checks
    // use.
    const staleHeartbeat = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    await store.update('tasks', task.id, {
      status: 'running',
      started_at: staleHeartbeat,
      claimed_at: staleHeartbeat,
      heartbeat_at: staleHeartbeat,
      progress: 25,
    });

    const result = await reclaimStaleTasks(store, OWNER_ID, { missionId: child.id });
    expect(result.requeued).toEqual([task.id]);
    expect(result.failed).toEqual([]);

    const reclaimed = await store.get('tasks', task.id);
    expect(reclaimed!.status).toBe('queued');
    expect(reclaimed!.reclaim_count).toBe(1);
    expect(reclaimed!.claimed_at).toBeNull();
    expect(reclaimed!.heartbeat_at).toBeNull();
    expect(reclaimed!.error).toMatch(/stale/i);
  });

  it('leaves a task alone while it is genuinely still inside its capability window', async () => {
    const { store, youtube } = await makeReadinessWorkspace();
    const { children } = await startOperationalReadiness(store, OWNER_ID);
    const child = children.find((c) => c.business_id === youtube.id)!;
    const task = (await store.list('tasks', { where: { mission_id: child.id } }))[0]!;

    const recentHeartbeat = new Date().toISOString();
    await store.update('tasks', task.id, {
      status: 'running',
      started_at: recentHeartbeat,
      claimed_at: recentHeartbeat,
      heartbeat_at: recentHeartbeat,
      progress: 25,
    });

    const result = await reclaimStaleTasks(store, OWNER_ID, { missionId: child.id });
    expect(result.requeued).toEqual([]);
    expect(result.failed).toEqual([]);

    const untouched = await store.get('tasks', task.id);
    expect(untouched!.status).toBe('running');
  });

  it('fails a task outright once it has already been reclaimed the maximum number of times', async () => {
    const { store, youtube } = await makeReadinessWorkspace();
    const { children } = await startOperationalReadiness(store, OWNER_ID);
    const child = children.find((c) => c.business_id === youtube.id)!;
    const task = (await store.list('tasks', { where: { mission_id: child.id } }))[0]!;

    const staleHeartbeat = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    await store.update('tasks', task.id, {
      status: 'running',
      heartbeat_at: staleHeartbeat,
      reclaim_count: 3,
    });

    const result = await reclaimStaleTasks(store, OWNER_ID, { missionId: child.id });
    expect(result.requeued).toEqual([]);
    expect(result.failed).toEqual([task.id]);

    const failed = await store.get('tasks', task.id);
    expect(failed!.status).toBe('failed');
    expect(failed!.error).toMatch(/recovery attempts/i);
  });
});

describe('parent recompute after reclaim', () => {
  it('a reclaimed-and-completed child brings the parent to completed too', async () => {
    const { store, youtube, etsy } = await makeReadinessWorkspace();
    const { parent, children } = await startOperationalReadiness(store, OWNER_ID);
    const youtubeChild = children.find((c) => c.business_id === youtube.id)!;
    const etsyChild = children.find((c) => c.business_id === etsy.id)!;
    const infraChild = children.find((c) => c.business_id === null)!;

    // Orphan the YouTube child's task, as if its process died mid-run.
    const task = (await store.list('tasks', { where: { mission_id: youtubeChild.id } }))[0]!;
    const staleHeartbeat = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    await store.update('tasks', task.id, {
      status: 'running',
      started_at: staleHeartbeat,
      claimed_at: staleHeartbeat,
      heartbeat_at: staleHeartbeat,
    });
    await recomputeMission(store, youtubeChild.id);

    await runMission(store, OWNER_ID, etsyChild.id);
    await runMission(store, OWNER_ID, infraChild.id);
    // Reclaims the orphaned task before attempting it, same as any other
    // call into `runMission` for this mission.
    await runMission(store, OWNER_ID, youtubeChild.id);

    const finishedParent = await store.get('missions', parent.id);
    expect(finishedParent!.status).toBe('completed');
    expect(typeof finishedParent!.context.report).toBe('string');
  });
});

describe('deterministic readiness handlers need no AI', () => {
  it('both readiness capabilities run in provider mode, with no model call', () => {
    expect(getCapabilityHandler('system.readiness.audit')!.mode).toBe('provider');
    expect(getCapabilityHandler('business.readiness.check')!.mode).toBe('provider');
  });

  it('completes a fresh readiness mission with ANTHROPIC_API_KEY unset', async () => {
    const { store, youtube } = await makeReadinessWorkspace();
    const { children } = await startOperationalReadiness(store, OWNER_ID);
    const child = children.find((c) => c.business_id === youtube.id)!;
    const run = await runMission(store, OWNER_ID, child.id);
    expect(run.status).toBe('completed');
  });
});

describe('no background worker is required', () => {
  it('a single runMission call takes a queued task all the way to completed — nothing else has to run', async () => {
    const { store, youtube } = await makeReadinessWorkspace();
    const { children } = await startOperationalReadiness(store, OWNER_ID);
    const child = children.find((c) => c.business_id === youtube.id)!;
    const task = (await store.list('tasks', { where: { mission_id: child.id } }))[0]!;
    expect(task.status).toBe('queued');

    await runMission(store, OWNER_ID, child.id);

    const after = await store.get('tasks', task.id);
    expect(after!.status).toBe('completed');
  });
});

describe('retry after stale recovery', () => {
  it('reclaiming and then retrying completes the task exactly once', async () => {
    const { store, youtube } = await makeReadinessWorkspace();
    const { children } = await startOperationalReadiness(store, OWNER_ID);
    const child = children.find((c) => c.business_id === youtube.id)!;
    const task = (await store.list('tasks', { where: { mission_id: child.id } }))[0]!;

    const staleHeartbeat = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    await store.update('tasks', task.id, {
      status: 'running',
      started_at: staleHeartbeat,
      claimed_at: staleHeartbeat,
      heartbeat_at: staleHeartbeat,
    });

    // `runMission` reclaims first, then runs — one call recovers and finishes it.
    const run = await runMission(store, OWNER_ID, child.id);
    expect(run.status).toBe('completed');

    const finished = await store.get('tasks', task.id);
    expect(finished!.status).toBe('completed');
    expect(finished!.reclaim_count).toBe(1);
  });
});

describe('no duplicate execution or cost from reclaim', () => {
  it('never touches a task that has already completed', async () => {
    const { store, youtube } = await makeReadinessWorkspace();
    const { children } = await startOperationalReadiness(store, OWNER_ID);
    const child = children.find((c) => c.business_id === youtube.id)!;
    const task = (await store.list('tasks', { where: { mission_id: child.id } }))[0]!;

    await runMission(store, OWNER_ID, child.id);
    const completed = await store.get('tasks', task.id);
    expect(completed!.status).toBe('completed');
    const usageBefore = await store.list('api_usage', { where: { task_id: task.id } });

    // Calling reclaim again — as `runMission` and every state read do — must
    // not re-open or re-run work that already finished.
    const result = await reclaimStaleTasks(store, OWNER_ID, { missionId: child.id });
    expect(result.requeued).toEqual([]);
    expect(result.failed).toEqual([]);

    const untouched = await store.get('tasks', task.id);
    expect(untouched).toEqual(completed);
    const usageAfter = await store.list('api_usage', { where: { task_id: task.id } });
    expect(usageAfter).toHaveLength(usageBefore.length);
  });
});

describe('business isolation under reclaim', () => {
  it('reclaiming one business child never touches a stale task in another business child', async () => {
    const { store, youtube, etsy } = await makeReadinessWorkspace();
    const { children } = await startOperationalReadiness(store, OWNER_ID);
    const youtubeChild = children.find((c) => c.business_id === youtube.id)!;
    const etsyChild = children.find((c) => c.business_id === etsy.id)!;

    const staleHeartbeat = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    for (const child of [youtubeChild, etsyChild]) {
      const task = (await store.list('tasks', { where: { mission_id: child.id } }))[0]!;
      await store.update('tasks', task.id, {
        status: 'running',
        started_at: staleHeartbeat,
        claimed_at: staleHeartbeat,
        heartbeat_at: staleHeartbeat,
      });
    }

    // Scoped to the YouTube child only.
    await reclaimStaleTasks(store, OWNER_ID, { missionId: youtubeChild.id });

    const youtubeTask = (await store.list('tasks', { where: { mission_id: youtubeChild.id } }))[0]!;
    expect(youtubeTask.status).toBe('queued');
    expect(youtubeTask.business_id).toBe(youtube.id);

    // The Etsy child's equally-stale task is completely untouched.
    const etsyTask = (await store.list('tasks', { where: { mission_id: etsyChild.id } }))[0]!;
    expect(etsyTask.status).toBe('running');
    expect(etsyTask.business_id).toBe(etsy.id);
  });
});
