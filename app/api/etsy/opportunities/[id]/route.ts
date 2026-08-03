import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guardPermission } from '@/lib/auth/session';
import { logActivity } from '@/lib/agents/activity';
import { createMission } from '@/lib/workflows/engine';
import { runMission } from '@/lib/workflows/runner';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const bodySchema = z.object({
  status: z.enum(['approved', 'rejected', 'saved', 'proposed']),
  /** Approving an opportunity can immediately start the full product build. */
  start_build: z.boolean().default(false),
});

/**
 * Decides one researched opportunity.
 *
 * The same shape as `PATCH /api/youtube/ideas/[id]`: an opportunity is a
 * proposal, not yet a product, and approving it is what turns it into one —
 * a new mission on the `etsy_product_build` workflow, seeded with the
 * opportunity so every step can reach it.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid status.' }, { status: 400 });
  }

  const guard = await guardPermission('missions.create');
  if ('response' in guard) return guard.response;
  const { store, ownerId } = guard;
  const opportunity = await store.get('etsy_opportunities', id);
  if (!opportunity) return NextResponse.json({ error: 'Opportunity not found.' }, { status: 404 });

  const updated = await store.update('etsy_opportunities', id, { status: parsed.data.status });

  await logActivity(store, {
    ownerId,
    businessId: opportunity.business_id,
    kind: 'system',
    message: `Opportunity "${opportunity.product}" marked ${parsed.data.status}`,
  });

  if (parsed.data.status !== 'approved' || !parsed.data.start_build) {
    return NextResponse.json({ opportunity: updated, mission: null, run: null });
  }

  const { mission } = await createMission(store, {
    ownerId,
    businessId: opportunity.business_id,
    title: `Build: ${opportunity.product}`,
    objective: `Turn the approved opportunity "${opportunity.product}" into a complete, packaged product.`,
    workflowKey: 'etsy_product_build',
    context: { opportunity_id: opportunity.id },
    seedInput: { opportunity_id: opportunity.id },
  });

  // Every step needs the opportunity, not just the first one — mirrors how
  // the YouTube idea is carried onto every task in its script mission.
  const tasks = await store.list('tasks', { where: { mission_id: mission.id } });
  for (const task of tasks) {
    await store.update('tasks', task.id, { input: { ...task.input, opportunity_id: opportunity.id } });
  }

  const run = await runMission(store, ownerId, mission.id);
  return NextResponse.json({ opportunity: updated, mission, run });
}
