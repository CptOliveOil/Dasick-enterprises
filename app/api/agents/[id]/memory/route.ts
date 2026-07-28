import { NextResponse } from 'next/server';
import { z } from 'zod';
import { uuid } from '@/lib/ids';
import { getStore } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { store, ownerId } = await getStore();
  const agent = await store.get('agents', id);
  if (!agent || agent.owner_id !== ownerId) {
    return NextResponse.json({ error: 'Agent not found.' }, { status: 404 });
  }
  const memory = await store.list('agent_memory', {
    where: { agent_id: id },
    orderBy: { column: 'importance', ascending: false },
  });
  return NextResponse.json({ memory });
}

const bodySchema = z.object({
  type: z.enum(['insight', 'preference', 'fact', 'constraint', 'performance']),
  content: z.string().min(5).max(2000),
  importance: z.number().int().min(1).max(5).default(3),
  source: z.string().max(200).default('Operator'),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid memory record.' }, { status: 400 });
  }

  const { store, ownerId } = await getStore();
  const agent = await store.get('agents', id);
  if (!agent || agent.owner_id !== ownerId) {
    return NextResponse.json({ error: 'Agent not found.' }, { status: 404 });
  }

  const row = await store.insert('agent_memory', {
    id: uuid(),
    agent_id: id,
    business_id: agent.business_id,
    type: parsed.data.type,
    content: parsed.data.content,
    importance: parsed.data.importance,
    source: parsed.data.source,
    created_at: new Date().toISOString(),
    last_used_at: null,
  });

  return NextResponse.json(row, { status: 201 });
}
