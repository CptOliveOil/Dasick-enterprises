import { NextResponse } from 'next/server';
import { z } from 'zod';
import { uuid } from '@/lib/ids';
import { getStore } from '@/lib/db';
import { runAgent } from '@/lib/agents/engine';
import { recomputeMission } from '@/lib/workflows/engine';
import type { Task } from '@/types/domain';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const bodySchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().max(2000).default(''),
  priority: z.enum(['low', 'normal', 'high', 'critical']).default('normal'),
  input: z.record(z.unknown()).default({}),
  execute: z.boolean().default(true),
});

/** "Give Task" from the Agent Inspector. Creates a standalone task and runs it. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Give the task a title.' }, { status: 400 });
  }

  const { store, ownerId } = await getStore();
  const agent = await store.get('agents', id);
  if (!agent || agent.owner_id !== ownerId) {
    return NextResponse.json({ error: 'Agent not found.' }, { status: 404 });
  }
  if (agent.status === 'disabled' || agent.status === 'offline') {
    return NextResponse.json(
      { error: `${agent.name} is ${agent.status}. Enable it before assigning work.` },
      { status: 409 },
    );
  }

  const timestamp = new Date().toISOString();
  const task: Task = {
    id: uuid(),
    owner_id: ownerId,
    mission_id: null,
    business_id: agent.business_id,
    agent_id: agent.id,
    step_key: null,
    title: parsed.data.title,
    description: parsed.data.description,
    status: 'queued',
    priority: parsed.data.priority,
    input: parsed.data.input,
    output: null,
    error: null,
    progress: 0,
    is_demo: false,
    created_at: timestamp,
    started_at: null,
    completed_at: null,
    due_at: null,
  };
  await store.insert('tasks', task);

  if (!parsed.data.execute) {
    return NextResponse.json({ task, result: null });
  }

  const result = await runAgent(store, ownerId, task.id);
  if (task.mission_id) await recomputeMission(store, task.mission_id);
  return NextResponse.json({ task: await store.get('tasks', task.id), result });
}
