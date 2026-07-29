import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withPermission } from '@/lib/auth/session';
import { logActivity } from '@/lib/agents/activity';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  agent_id: z.string().uuid(),
  action: z.enum(['assign', 'unassign']),
});

/**
 * Moves an agent between a business and the shared pool.
 *
 * "Unassign" sets `business_id` to null — the agent becomes shared, available
 * to every business. It is emphatically not a delete: the agent, its history,
 * its costs and its memory all stay exactly where they are. Removing an agent
 * from a business should never be a way to lose one.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  return withPermission('agents.edit', async ({ store, ownerId }) => {
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid assignment.' }, { status: 400 });
    }

    const business = await store.get('businesses', id);
    if (!business || business.owner_id !== ownerId) {
      return NextResponse.json({ error: 'Business not found.' }, { status: 404 });
    }

    const agent = await store.get('agents', parsed.data.agent_id);
    if (!agent || agent.owner_id !== ownerId) {
      return NextResponse.json({ error: 'Agent not found.' }, { status: 404 });
    }

    const assigning = parsed.data.action === 'assign';
    const updated = await store.update('agents', agent.id, {
      business_id: assigning ? business.id : null,
      updated_at: new Date().toISOString(),
    });

    await logActivity(store, {
      ownerId,
      businessId: assigning ? business.id : agent.business_id,
      agentId: agent.id,
      kind: 'system',
      message: assigning
        ? `${agent.name} was assigned to ${business.name}`
        : `${agent.name} became a shared agent — it now works across every business`,
    });

    return NextResponse.json(updated);
  });
}
