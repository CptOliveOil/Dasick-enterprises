import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getStore } from '@/lib/db';
import { logActivity } from '@/lib/agents/activity';

export const dynamic = 'force-dynamic';

const patchSchema = z.object({
  status: z.enum(['idle', 'disabled', 'offline']).optional(),
  system_prompt: z.string().min(10).max(20_000).optional(),
  model: z.string().min(2).max(120).optional(),
  provider: z.enum(['anthropic', 'openai', 'google', 'mock']).optional(),
  temperature: z.number().min(0).max(1).optional(),
  max_tokens: z.number().int().min(256).max(64_000).optional(),
  authority_level: z.union([
    z.literal(0),
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
  ]).optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid agent settings.' }, { status: 400 });
  }

  const { store, ownerId } = await getStore();
  const agent = await store.get('agents', id);
  if (!agent || agent.owner_id !== ownerId) {
    return NextResponse.json({ error: 'Agent not found.' }, { status: 404 });
  }

  const updated = await store.update('agents', id, {
    ...parsed.data,
    updated_at: new Date().toISOString(),
  });

  if (parsed.data.status && parsed.data.status !== agent.status) {
    await logActivity(store, {
      ownerId,
      businessId: agent.business_id,
      agentId: agent.id,
      kind: 'system',
      message: `${agent.name} was set to ${parsed.data.status}`,
    });
  }

  return NextResponse.json(updated);
}
