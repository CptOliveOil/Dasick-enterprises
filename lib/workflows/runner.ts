import 'server-only';
import type { DataStore } from '@/lib/db/tables';
import { logActivity } from '@/lib/agents/activity';
import { runAgent, type RunAgentResult } from '@/lib/agents/engine';
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

  for (let step = 0; step < maxSteps; step += 1) {
    await releaseUnblockedTasks(store, missionId);
    const runnable = await getRunnableTasks(store, missionId);
    if (runnable.length === 0) break;

    const task = runnable[0]!;
    const previousAgentId = results.at(-1)
      ? ((await store.get('tasks', results.at(-1)!.taskId))?.agent_id ?? null)
      : null;

    // A handoff is what draws the beam between two planets in the galaxy.
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

  return {
    missionId,
    results,
    status: mission?.status ?? 'unknown',
    haltedBecause,
  };
}
