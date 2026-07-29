import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guardPermission } from '@/lib/auth/session';
import { recomputeMission } from '@/lib/workflows/engine';
import { runMission } from '@/lib/workflows/runner';
import { runAgent } from '@/lib/agents/engine';
import { recordOperatorAction } from '@/lib/production/actions';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const bodySchema = z.object({
  action: z.enum(['pause', 'resume', 'cancel', 'retry_task', 'skip_task', 'reassign']),
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

    default:
      return NextResponse.json({ error: 'Unknown control action.' }, { status: 400 });
  }
}
