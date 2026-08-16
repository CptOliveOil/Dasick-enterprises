import 'server-only';
import type { DataStore } from '@/lib/db/tables';
import { logActivity } from '@/lib/agents/activity';
import { runAgent, type RunAgentResult } from '@/lib/agents/engine';
import { recordMissionOutcome } from '@/lib/memory/business';
import { reclaimStaleTasks } from './reclaim';
import {
  getRunnableTasks,
  recomputeMission,
  releaseUnblockedTasks,
} from './engine';

export interface RunMissionOptions {
  /** Hard ceiling on agent invocations per call, so one request cannot run away. */
  maxSteps?: number;
}

export interface RunMissionResult {
  missionId: string;
  results: RunAgentResult[];
  status: string;
  /** Set when the mission stopped for a reason worth showing the operator. */
  haltedBecause: string | null;
}

/**
 * Drives a mission forward: run whatever is runnable, release the steps that
 * unblocks, repeat. Stops at an approval gate, a failure, or the step ceiling.
 *
 * This is the only place that sequences `runAgent` calls, which keeps the
 * "who runs next" rule in one file.
 */
export async function runMission(
  store: DataStore,
  ownerId: string,
  missionId: string,
  options: RunMissionOptions = {},
): Promise<RunMissionResult> {
  const maxSteps = options.maxSteps ?? 6;
  const results: RunAgentResult[] = [];
  let haltedBecause: string | null = null;

  // Before doing anything else: a task this mission left `running` from a
  // request that never reached its own completion (a crashed process, a
  // server restart between steps) is not being worked on by anything —
  // reclaiming it here is what lets this same call pick it back up instead
  // of finding it "running" and skipping it forever.
  await reclaimStaleTasks(store, ownerId, { missionId });

  for (let step = 0; step < maxSteps; step += 1) {
    await releaseUnblockedTasks(store, missionId);
    const runnable = await getRunnableTasks(store, missionId);
    if (runnable.length === 0) {
      // Nothing left to attempt: every remaining task is either finished,
      // waiting on a dependency that has not resolved, or (rarely) `waiting`
      // for an approval-driven re-queue that has not happened yet. A task
      // with no agent is *not* one of these cases any more — it is runnable,
      // and `runAgent` fails it plainly instead of leaving it stuck.
      break;
    }

    const task = runnable[0]!;
    const previousAgentId = results.at(-1)
      ? ((await store.get('tasks', results.at(-1)!.taskId))?.agent_id ?? null)
      : null;

    // A handoff is what flies a craft between two planets in the galaxy.
    if (previousAgentId && task.agent_id && previousAgentId !== task.agent_id) {
      const from = await store.get('agents', previousAgentId);
      const to = await store.get('agents', task.agent_id);
      if (from && to) {
        await logActivity(store, {
          ownerId,
          businessId: task.business_id,
          missionId,
          taskId: task.id,
          agentId: from.id,
          targetAgentId: to.id,
          kind: 'handoff',
          message: `${from.name} passed work to ${to.name}`,
        });
      }
    }

    const result = await runAgent(store, ownerId, task.id);
    results.push(result);
    await recomputeMission(store, missionId);

    if (result.status === 'failed') {
      haltedBecause = `Stopped: ${result.error}`;
      break;
    }
    if (result.blocked) {
      haltedBecause = result.blocked;
      break;
    }
    if (result.approvalId) {
      haltedBecause = 'Waiting for your approval before continuing.';
      break;
    }
  }

  await releaseUnblockedTasks(store, missionId);
  const mission = await recomputeMission(store, missionId);

  // Business Intelligence Memory. Recording lives at both places a mission can
  // reach `completed` — here and in approval resolution — because a mission
  // that ends on an approval never passes through this function. Recording is
  // idempotent by mission, so being called from both is harmless.
  if (mission?.status === 'completed') {
    await recordMissionOutcome(store, mission).catch(() => null);
  }

  return {
    missionId,
    results,
    status: mission?.status ?? 'unknown',
    haltedBecause,
  };
}
