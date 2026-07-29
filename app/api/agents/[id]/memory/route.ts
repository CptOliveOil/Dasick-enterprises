import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guardPermission } from '@/lib/auth/session';
import { newMemory } from '@/lib/agents/memory-factory';
import { logActivity } from '@/lib/agents/activity';

export const dynamic = 'force-dynamic';

const MEMORY_TYPES = ['insight', 'preference', 'fact', 'constraint', 'performance'] as const;

/** Everything the memory screen shows, in the order the engine loads it. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const guard = await guardPermission('agents.edit');
  if ('response' in guard) return guard.response;
  const { store, ownerId } = guard;

  const agent = await store.get('agents', id);
  if (!agent || agent.owner_id !== ownerId) {
    return NextResponse.json({ error: 'Agent not found.' }, { status: 404 });
  }

  const url = new URL(request.url);
  const query = url.searchParams.get('q')?.trim().toLowerCase() ?? '';
  const includeArchived = url.searchParams.get('archived') === 'true';

  let memory = await store.list('agent_memory', { where: { agent_id: id } });
  if (!includeArchived) memory = memory.filter((row) => row.status !== 'archived');
  if (query) {
    memory = memory.filter(
      (row) =>
        row.content.toLowerCase().includes(query) ||
        row.type.toLowerCase().includes(query) ||
        row.source.toLowerCase().includes(query),
    );
  }

  // Pinned first, then importance, then recency — the same order the engine
  // loads them in, so what you see is what the agent sees.
  memory.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (b.importance !== a.importance) return b.importance - a.importance;
    return b.created_at.localeCompare(a.created_at);
  });

  return NextResponse.json({ memory });
}

const createSchema = z.object({
  type: z.enum(MEMORY_TYPES),
  content: z.string().min(5).max(2000),
  importance: z.number().int().min(1).max(5).default(3),
  source: z.string().max(200).default('Operator'),
  business_id: z.string().uuid().nullable().optional(),
});

/**
 * Records a memory the *operator* wrote.
 *
 * Owner-written memories are active immediately and never submitted for the
 * owner's own approval — the gate exists for durable rules an agent decided to
 * write, not for the operator's instructions to their own workforce.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid memory record.' }, { status: 400 });
  }

  const guard = await guardPermission('agents.edit');
  if ('response' in guard) return guard.response;
  const { store, ownerId } = guard;

  const agent = await store.get('agents', id);
  if (!agent || agent.owner_id !== ownerId) {
    return NextResponse.json({ error: 'Agent not found.' }, { status: 404 });
  }

  const row = await store.insert(
    'agent_memory',
    newMemory({
      agent_id: id,
      business_id: parsed.data.business_id ?? agent.business_id,
      type: parsed.data.type,
      content: parsed.data.content,
      importance: parsed.data.importance,
      source: parsed.data.source,
      origin: 'owner',
      status: 'active',
    }),
  );

  return NextResponse.json(row, { status: 201 });
}

const patchSchema = z.object({
  memory_id: z.string().uuid(),
  content: z.string().min(5).max(2000).optional(),
  type: z.enum(MEMORY_TYPES).optional(),
  importance: z.number().int().min(1).max(5).optional(),
  pinned: z.boolean().optional(),
  archived: z.boolean().optional(),
});

/** Edit, pin or archive a memory. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid memory change.' }, { status: 400 });
  }

  const guard = await guardPermission('agents.edit');
  if ('response' in guard) return guard.response;
  const { store, ownerId } = guard;

  const agent = await store.get('agents', id);
  if (!agent || agent.owner_id !== ownerId) {
    return NextResponse.json({ error: 'Agent not found.' }, { status: 404 });
  }
  const memory = await store.get('agent_memory', parsed.data.memory_id);
  if (!memory || memory.agent_id !== id) {
    return NextResponse.json({ error: 'Memory not found.' }, { status: 404 });
  }

  const { memory_id: memoryId, archived, ...fields } = parsed.data;
  const patch: Record<string, unknown> = { ...fields };
  if (archived !== undefined) patch.status = archived ? 'archived' : 'active';

  const updated = await store.update('agent_memory', memoryId, patch);
  return NextResponse.json(updated);
}

/**
 * Deletes a memory.
 *
 * Only safe for a memory nothing has used. Once a memory has been loaded into a
 * run it is part of why an agent produced what it produced, so it is archived
 * instead — deleting it would quietly rewrite the explanation for work that has
 * already happened.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const memoryId = new URL(request.url).searchParams.get('memory_id');
  if (!memoryId) {
    return NextResponse.json({ error: 'No memory named.' }, { status: 400 });
  }

  const guard = await guardPermission('agents.edit');
  if ('response' in guard) return guard.response;
  const { store, ownerId } = guard;

  const agent = await store.get('agents', id);
  if (!agent || agent.owner_id !== ownerId) {
    return NextResponse.json({ error: 'Agent not found.' }, { status: 404 });
  }
  const memory = await store.get('agent_memory', memoryId);
  if (!memory || memory.agent_id !== id) {
    return NextResponse.json({ error: 'Memory not found.' }, { status: 404 });
  }

  if (memory.last_used_at) {
    return NextResponse.json(
      {
        error:
          'This memory has already been used in a run, so deleting it would rewrite why an agent produced what it did. Archive it instead — it stops being loaded but stays on the record.',
      },
      { status: 409 },
    );
  }

  await store.remove('agent_memory', memoryId);
  await logActivity(store, {
    ownerId,
    businessId: agent.business_id,
    agentId: agent.id,
    kind: 'system',
    message: `A memory was deleted from ${agent.name} — it had never been used`,
  });
  return NextResponse.json({ deleted: true });
}
