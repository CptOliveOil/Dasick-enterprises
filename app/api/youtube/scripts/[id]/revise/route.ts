import { NextResponse } from 'next/server';
import { z } from 'zod';
import { uuid } from '@/lib/ids';
import { guardPermission } from '@/lib/auth/session';
import { runAgent } from '@/lib/agents/engine';
import { resolveAgentForCapability } from '@/lib/workflows/engine';
import type { Task } from '@/types/domain';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const bodySchema = z.object({
  instruction: z.string().min(3).max(1000),
  section_heading: z.string().max(200).optional(),
});

/**
 * Hands a script back to the Scriptwriter with an instruction. Runs through the
 * same execution engine as every other agent call, so usage and cost are recorded.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Say what should change.' }, { status: 400 });
  }

  const guard = await guardPermission('missions.create');
  if ('response' in guard) return guard.response;
  const { store, ownerId } = guard;
  const script = await store.get('youtube_scripts', id);
  if (!script) return NextResponse.json({ error: 'Script not found.' }, { status: 404 });

  const agentId = await resolveAgentForCapability(
    store,
    ownerId,
    'youtube.script.revise',
    script.business_id,
  );
  if (!agentId) {
    return NextResponse.json(
      { error: 'No available agent can revise scripts.' },
      { status: 409 },
    );
  }

  const timestamp = new Date().toISOString();
  const task: Task = {
    id: uuid(),
    owner_id: ownerId,
    mission_id: null,
    business_id: script.business_id,
    agent_id: agentId,
    step_key: null,
    title: `Revise "${script.title}"`,
    description: parsed.data.instruction,
    status: 'queued',
    priority: 'normal',
    input: {
      capability: 'youtube.script.revise',
      script_id: id,
      instruction: parsed.data.instruction,
      ...(parsed.data.section_heading ? { section_heading: parsed.data.section_heading } : {}),
    },
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

  const result = await runAgent(store, ownerId, task.id);
  const updated = await store.get('youtube_scripts', id);
  return NextResponse.json({ result, script: updated });
}
