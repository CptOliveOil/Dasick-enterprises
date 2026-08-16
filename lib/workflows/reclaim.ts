import 'server-only';
import type { DataStore } from '@/lib/db/tables';
import { logActivity, notify } from '@/lib/agents/activity';

/**
 * Stale-task recovery.
 *
 * There is no background worker anywhere in this system — every task runs
 * synchronously inside whatever request called `runAgent`/`runMission` (an
 * operator command, an approval, a retry click). A task can only ever reach
 * `running` because that request marked it so, and only that same request's
 * own completion ever moves it out of `running` again. If the process died
 * mid-request — a dev-server restart, a crashed container, a deploy — the
 * task is orphaned: still `running` in storage forever, with nothing left
 * anywhere that is actually working on it, and indistinguishable from a
 * genuinely long render or upload without more information.
 *
 * `heartbeat_at` is that information. `runAgent` bumps it at every progress
 * milestone while a task is `running`; a task whose heartbeat has not moved
 * within its capability's expected window is treated as orphaned, not busy.
 */

/** A quick, deterministic, no-AI check should never look "running" for long. */
const FAST_STALE_MS = 2 * 60 * 1000;

/** Media generation, rendering and publishing genuinely take a while. */
const LONG_STALE_MS = 60 * 60 * 1000;

/** Everything else — a single AI call. */
const DEFAULT_STALE_MS = 15 * 60 * 1000;

/**
 * A task that keeps coming back stale the same way is not being recovered by
 * reclaiming it — it is crash-looping. Bounded so it ends in `failed`, with a
 * reason, instead of being silently requeued forever.
 */
const MAX_RECLAIMS = 3;

const FAST_CAPABILITIES = new Set(['system.readiness.audit', 'business.readiness.check']);

const LONG_CAPABILITIES = new Set([
  'youtube.video_assemble',
  'youtube.voiceover.generate',
  'youtube.asset_generate',
  'youtube.publish',
  'etsy.artwork.generate',
  'etsy.artwork.upscale',
  'etsy.artwork.variants',
  'etsy.mockups.generate',
  'etsy.package.zip',
]);

function staleThresholdMs(capability: string | null): number {
  if (capability && FAST_CAPABILITIES.has(capability)) return FAST_STALE_MS;
  if (capability && LONG_CAPABILITIES.has(capability)) return LONG_STALE_MS;
  return DEFAULT_STALE_MS;
}

export interface ReclaimResult {
  /** Task ids returned to `queued`, ready to be picked up again. */
  requeued: string[];
  /** Task ids that had already been reclaimed `MAX_RECLAIMS` times and were failed instead. */
  failed: string[];
}

const EMPTY_RESULT: ReclaimResult = { requeued: [], failed: [] };

/**
 * Finds every `running` task for this owner (optionally narrowed to one
 * mission) whose heartbeat has gone quiet for longer than its capability's
 * expected window, and either returns it to `queued` (bumping
 * `reclaim_count`) or, once that has already happened `MAX_RECLAIMS` times,
 * fails it with a clear reason rather than reclaiming it forever.
 *
 * Safe to call on every mission run and every state read: a task that is
 * genuinely still within its window is never touched.
 */
export async function reclaimStaleTasks(
  store: DataStore,
  ownerId: string,
  scope: { missionId?: string } = {},
): Promise<ReclaimResult> {
  const running = await store.list('tasks', {
    where: scope.missionId
      ? { owner_id: ownerId, mission_id: scope.missionId, status: 'running' }
      : { owner_id: ownerId, status: 'running' },
  });
  if (running.length === 0) return EMPTY_RESULT;

  const requeued: string[] = [];
  const failed: string[] = [];
  const now = Date.now();

  for (const task of running) {
    const capability =
      typeof task.input.capability === 'string' ? task.input.capability : null;
    const threshold = staleThresholdMs(capability);
    const lastSign = task.heartbeat_at ?? task.claimed_at ?? task.started_at ?? task.created_at;
    const age = now - new Date(lastSign).getTime();
    if (age < threshold) continue;

    const timestamp = new Date().toISOString();
    const minutes = Math.round(threshold / 60_000);

    if (task.reclaim_count >= MAX_RECLAIMS) {
      const message = `No activity for over ${minutes} min, ${task.reclaim_count} recovery attempts already made — stopped retrying automatically.`;
      await store.update('tasks', task.id, {
        status: 'failed',
        error: message,
        completed_at: timestamp,
      });
      await logActivity(store, {
        ownerId,
        businessId: task.business_id,
        missionId: task.mission_id,
        taskId: task.id,
        agentId: null,
        kind: 'agent_failed',
        message: `"${task.title}" — ${message}`,
      });
      await notify(store, {
        ownerId,
        kind: 'agent_failed',
        title: 'A task kept dying the same way',
        body: message,
        href: `/tasks/${task.id}`,
      });
      failed.push(task.id);
      continue;
    }

    const message = `Recovered from a stale run — no activity for over ${minutes} min, likely an interrupted server restart.`;
    await store.update('tasks', task.id, {
      status: 'queued',
      claimed_at: null,
      heartbeat_at: null,
      started_at: null,
      progress: 0,
      reclaim_count: task.reclaim_count + 1,
      error: message,
    });
    await logActivity(store, {
      ownerId,
      businessId: task.business_id,
      missionId: task.mission_id,
      taskId: task.id,
      agentId: null,
      kind: 'system',
      message: `"${task.title}" — ${message}`,
    });
    requeued.push(task.id);
  }

  return { requeued, failed };
}
