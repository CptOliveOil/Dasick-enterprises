import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guardPermission } from '@/lib/auth/session';
import { recomputeMission, releaseUnblockedTasks } from '@/lib/workflows/engine';
import { runMission } from '@/lib/workflows/runner';
import { reclaimStaleTasks } from '@/lib/workflows/reclaim';
import { runAgent } from '@/lib/agents/engine';
import { recordOperatorAction } from '@/lib/production/actions';
import { dataErrorResponse } from '@/lib/api/errors';
import type { DataStore } from '@/lib/db/tables';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const bodySchema = z.object({
  action: z.enum([
    'pause',
    'resume',
    'cancel',
    'retry_task',
    'retry_mission',
    'skip_task',
    'reassign',
  ]),
  task_id: z.string().uuid().optional(),
  agent_id: z.string().uuid().optional(),
});

/**
 * Operator control over a running mission.
 *
 * Every intervention is recorded in the activity log, so a mission's history
 * shows what the workforce did and what the operator did to it.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Unknown control action.' }, { status: 400 });
  }

  const guard = await guardPermission('missions.create');
  if ('response' in guard) return guard.response;
  const { store, ownerId } = guard;

  try {
  const mission = await store.get('missions', id);
  if (!mission || mission.owner_id !== ownerId) {
    return NextResponse.json({ error: 'Mission not found.' }, { status: 404 });
  }

  const tasks = await store.list('tasks', { where: { mission_id: id } });
  const label = `Mission #${String(mission.number).padStart(3, '0')}`;

  switch (parsed.data.action) {
    case 'pause': {
      // Pausing parks everything not yet started; running work is left to finish.
      for (const task of tasks.filter((t) => t.status === 'queued')) {
        await store.update('tasks', task.id, {
          status: 'waiting',
          error: 'Paused by the operator.',
        });
      }
      await store.update('missions', id, { status: 'waiting', updated_at: new Date().toISOString() });
      await recordOperatorAction(store, {
        ownerId,
        businessId: mission.business_id,
        missionId: id,
        message: `${label} paused`,
      });
      return NextResponse.json({ mission: await store.get('missions', id) });
    }

    case 'resume': {
      for (const task of tasks.filter(
        (t) => t.status === 'waiting' && t.error === 'Paused by the operator.',
      )) {
        await store.update('tasks', task.id, { status: 'queued', error: null });
      }
      await recordOperatorAction(store, {
        ownerId,
        businessId: mission.business_id,
        missionId: id,
        message: `${label} resumed`,
      });
      const run = await runMission(store, ownerId, id);
      return NextResponse.json({ mission: await store.get('missions', id), run });
    }

    case 'cancel': {
      for (const task of tasks.filter(
        (t) => !['completed', 'failed', 'cancelled'].includes(t.status),
      )) {
        await store.update('tasks', task.id, {
          status: 'cancelled',
          error: 'Cancelled by the operator.',
        });
      }
      await store.update('missions', id, {
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      });
      await recordOperatorAction(store, {
        ownerId,
        businessId: mission.business_id,
        missionId: id,
        message: `${label} cancelled`,
      });
      return NextResponse.json({ mission: await store.get('missions', id) });
    }

    case 'skip_task': {
      const task = tasks.find((t) => t.id === parsed.data.task_id);
      if (!task) return NextResponse.json({ error: 'Task not found.' }, { status: 404 });
      // Skipping completes the step so dependants release, and says so.
      await store.update('tasks', task.id, {
        status: 'completed',
        output: { skipped: true },
        error: 'Skipped by the operator.',
        completed_at: new Date().toISOString(),
      });
      await recordOperatorAction(store, {
        ownerId,
        businessId: mission.business_id,
        missionId: id,
        taskId: task.id,
        message: `Skipped "${task.title}"`,
      });
      await recomputeMission(store, id);
      return NextResponse.json({ mission: await store.get('missions', id) });
    }

    case 'reassign': {
      const task = tasks.find((t) => t.id === parsed.data.task_id);
      if (!task) return NextResponse.json({ error: 'Task not found.' }, { status: 404 });
      const agent = parsed.data.agent_id
        ? await store.get('agents', parsed.data.agent_id)
        : null;
      if (!agent || agent.owner_id !== ownerId) {
        return NextResponse.json({ error: 'Agent not found.' }, { status: 404 });
      }
      const capability = String(task.input.capability ?? '');
      if (capability && !agent.capabilities.includes(capability)) {
        return NextResponse.json(
          { error: `${agent.name} does not provide "${capability}".` },
          { status: 409 },
        );
      }
      await store.update('tasks', task.id, {
        agent_id: agent.id,
        status: 'queued',
        error: null,
        output: null,
        progress: 0,
      });
      await recordOperatorAction(store, {
        ownerId,
        businessId: mission.business_id,
        missionId: id,
        taskId: task.id,
        message: `Reassigned "${task.title}" to ${agent.name}`,
      });
      return NextResponse.json({ mission: await store.get('missions', id) });
    }

    case 'retry_task': {
      const task = tasks.find((t) => t.id === parsed.data.task_id);
      if (!task) return NextResponse.json({ error: 'Task not found.' }, { status: 404 });
      await store.update('tasks', task.id, {
        status: 'queued',
        error: null,
        output: null,
        progress: 0,
        started_at: null,
        completed_at: null,
      });
      await recordOperatorAction(store, {
        ownerId,
        businessId: mission.business_id,
        missionId: id,
        taskId: task.id,
        message: `Retrying "${task.title}"`,
      });
      const result = await runAgent(store, ownerId, task.id);
      await recomputeMission(store, id);
      return NextResponse.json({ result, mission: await store.get('missions', id) });
    }

    case 'retry_mission': {
      // A pure orchestrator (Operational Readiness and the like) has no tasks
      // of its own — its status is entirely derived from its children (see
      // `deriveParentMissionState`/`recomputeMission`). Retrying it means
      // retrying whichever children have not reached a terminal state; there
      // is nothing on the parent's own row to reset.
      const children =
        tasks.length === 0
          ? await store.list('missions', { where: { parent_mission_id: id } })
          : [];

      if (children.length > 0) {
        const runs = [];
        let retriedChildren = 0;
        for (const child of children) {
          if (child.status === 'completed' || child.status === 'cancelled') continue;
          await retryMissionTasks(store, ownerId, child.id);
          runs.push(await runMission(store, ownerId, child.id));
          retriedChildren += 1;
        }
        await recordOperatorAction(store, {
          ownerId,
          businessId: mission.business_id,
          missionId: id,
          taskId: null,
          message:
            retriedChildren > 0
              ? `Retried ${retriedChildren} child mission${retriedChildren === 1 ? '' : 's'}`
              : 'Nothing to retry — every child mission has already finished',
        });
        return NextResponse.json({
          retried: retriedChildren,
          runs,
          mission: await store.get('missions', id),
        });
      }

      const { resettable, kept } = await retryMissionTasks(store, ownerId, id);
      if (resettable === 0) {
        return NextResponse.json(
          {
            error: 'Nothing to retry — this mission has no failed, stale or unstarted steps.',
            retried: 0,
          },
          { status: 409 },
        );
      }

      await recordOperatorAction(store, {
        ownerId,
        businessId: mission.business_id,
        missionId: id,
        taskId: null,
        message: `Retrying ${resettable} step${resettable === 1 ? '' : 's'} — completed work was kept`,
      });

      const run = await runMission(store, ownerId, id);
      return NextResponse.json({
        retried: resettable,
        kept,
        run,
        mission: await store.get('missions', id),
      });
    }

    default:
      return NextResponse.json({ error: 'Unknown control action.' }, { status: 400 });
    }
  } catch (error) {
    // Always JSON, and a data problem reported as one rather than as a fault.
    const data = dataErrorResponse(error);
    if (data) return data;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'That action could not be completed.' },
      { status: 500 },
    );
  }
}

/**
 * Resets one mission's own failed steps (and the steps cancelled *because* of
 * them) to `queued`, reclaims anything left stale `running` first, and
 * releases whatever that unblocks.
 *
 * A step that is already `queued` and was simply never attempted — the exact
 * shape a task with no assigned agent used to get stuck in, and identical to
 * what a stale `running` task looks like right after `reclaimStaleTasks`
 * requeues it — needs no resetting; it is already runnable. It still counts
 * toward `resettable`, so a mission whose only problem was "nobody ever
 * picked this up" is not reported as having "nothing to retry".
 *
 * Never calls `runMission` itself — the two call sites differ on whether
 * "nothing to retry" is a 409 (a single mission) or simply skipped (one
 * child among several, cascaded from a parent orchestrator).
 */
async function retryMissionTasks(
  store: DataStore,
  ownerId: string,
  missionId: string,
): Promise<{ resettable: number; kept: number }> {
  await reclaimStaleTasks(store, ownerId, { missionId });
  const tasks = await store.list('tasks', { where: { mission_id: missionId } });

  const failed = tasks.filter((task) => task.status === 'failed');
  const collateral = tasks.filter(
    (task) =>
      task.status === 'cancelled' &&
      task.error === 'An upstream step failed, so this step was cancelled.',
  );
  const queued = tasks.filter((task) => task.status === 'queued');

  for (const task of [...failed, ...collateral]) {
    await store.update('tasks', task.id, {
      status: 'queued',
      error: null,
      output: null,
      progress: 0,
      started_at: null,
      completed_at: null,
      claimed_at: null,
      heartbeat_at: null,
    });
  }

  await releaseUnblockedTasks(store, missionId);

  const resettable = failed.length + collateral.length + queued.length;
  return { resettable, kept: tasks.length - resettable };
}
