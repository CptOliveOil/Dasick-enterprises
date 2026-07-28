import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getStore } from '@/lib/db';
import { logActivity } from '@/lib/agents/activity';
import { createMission } from '@/lib/workflows/engine';
import { runMission } from '@/lib/workflows/runner';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const bodySchema = z.object({
  status: z.enum(['approved', 'rejected', 'saved', 'proposed']),
  /** Approving an idea can immediately start the research → script → fact check run. */
  start_script: z.boolean().default(false),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid status.' }, { status: 400 });
  }

  const { store, ownerId } = await getStore();
  const idea = await store.get('youtube_ideas', id);
  if (!idea) return NextResponse.json({ error: 'Idea not found.' }, { status: 404 });

  const updated = await store.update('youtube_ideas', id, { status: parsed.data.status });

  await logActivity(store, {
    ownerId,
    businessId: idea.business_id,
    kind: 'system',
    message: `Idea "${idea.title}" marked ${parsed.data.status}`,
  });

  if (parsed.data.status !== 'approved' || !parsed.data.start_script) {
    return NextResponse.json({ idea: updated, mission: null, run: null });
  }

  const { mission } = await createMission(store, {
    ownerId,
    businessId: idea.business_id,
    title: `Script: ${idea.title}`,
    objective: `Research and script "${idea.title}", then fact check it before approval.`,
    workflowKey: 'youtube_script',
    context: { idea_id: idea.id },
    seedInput: { idea_id: idea.id },
  });

  // Every step needs the idea, not just the first one.
  const tasks = await store.list('tasks', { where: { mission_id: mission.id } });
  for (const task of tasks) {
    await store.update('tasks', task.id, { input: { ...task.input, idea_id: idea.id } });
  }

  const run = await runMission(store, ownerId, mission.id);
  return NextResponse.json({ idea: updated, mission, run });
}
