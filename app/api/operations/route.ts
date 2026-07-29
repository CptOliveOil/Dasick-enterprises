import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession, guardPermission } from '@/lib/auth/session';
import { buildDigest } from '@/lib/operations/digest';
import { quickCommands } from '@/lib/operations/quick-commands';
import { runAgent } from '@/lib/agents/engine';
import { resolveAgentForCapability } from '@/lib/workflows/engine';
import { uuid } from '@/lib/ids';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** The operational picture: what needs you, what happened today, what to try next. */
export async function GET() {
  const { store, ownerId, profile } = await getSession();
  const { digest, needsYou } = await buildDigest(store, ownerId);

  const [businesses, missions, tasks] = await Promise.all([
    store.list('businesses', { where: { owner_id: ownerId } }),
    store.list('missions', { where: { owner_id: ownerId } }),
    store.list('tasks', { where: { owner_id: ownerId } }),
  ]);

  return NextResponse.json(
    {
      displayName: profile.display_name,
      needsYou,
      today: digest.today,
      businesses: digest.businesses,
      missions: digest.missions,
      agents: digest.agents,
      suggestions: quickCommands({ businesses, missions, tasks, needsYou }),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

const bodySchema = z.object({
  action: z.enum(['briefing', 'recommendations']),
});

/**
 * Runs the Manager.
 *
 * Through `runAgent`, exactly like every other agent run: authority, context,
 * memory, Zod validation, cost tracking, task logging and activity logging all
 * apply. This route creates a task and hands it to the engine — it does not
 * call an AI provider, and could not: only `lib/agents/engine.ts` does that.
 */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Unknown operation.' }, { status: 400 });
  }

  const guard = await guardPermission('missions.create');
  if ('response' in guard) return guard.response;
  const { store, ownerId } = guard;

  const capability =
    parsed.data.action === 'briefing' ? 'manager.briefing' : 'manager.recommendations';

  const agentId = await resolveAgentForCapability(store, ownerId, capability, null);
  if (!agentId) {
    return NextResponse.json(
      {
        error: `No agent provides ${capability}. Give the Manager that capability in Agents, or create an agent that has it.`,
      },
      { status: 409 },
    );
  }

  const timestamp = new Date().toISOString();
  const task = await store.insert('tasks', {
    id: uuid(),
    owner_id: ownerId,
    mission_id: null,
    business_id: null,
    agent_id: agentId,
    step_key: parsed.data.action,
    title:
      parsed.data.action === 'briefing'
        ? 'Write the daily briefing'
        : 'Recommend what to do next',
    description: '',
    status: 'queued',
    priority: 'normal',
    input: { capability },
    output: null,
    error: null,
    progress: 0,
    is_demo: false,
    created_at: timestamp,
    started_at: null,
    completed_at: null,
    due_at: null,
  });

  const result = await runAgent(store, ownerId, task.id);
  if (result.status !== 'completed') {
    return NextResponse.json(
      { error: result.error ?? 'The Manager could not complete that.' },
      { status: 502 },
    );
  }

  return NextResponse.json({
    action: parsed.data.action,
    output: result.output,
    simulated: result.simulated,
  });
}
