import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guardPermission } from '@/lib/auth/session';
import { logActivity } from '@/lib/agents/activity';
import { MISSION_PRIORITIES } from '@/types/domain';

export const dynamic = 'force-dynamic';

const patchSchema = z.object({
  priority: z.enum(MISSION_PRIORITIES).optional(),
  /** ISO date, or null to clear. Never inferred — only ever set deliberately. */
  target_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  target_time: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable()
    .optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid mission change.' }, { status: 400 });
  }

  const guard = await guardPermission('missions.create');
  if ('response' in guard) return guard.response;
  const { store, ownerId } = guard;

  const mission = await store.get('missions', id);
  if (!mission || mission.owner_id !== ownerId) {
    return NextResponse.json({ error: 'Mission not found.' }, { status: 404 });
  }

  const updated = await store.update('missions', id, {
    ...parsed.data,
    updated_at: new Date().toISOString(),
  });

  if (parsed.data.priority && parsed.data.priority !== mission.priority) {
    await logActivity(store, {
      ownerId,
      businessId: mission.business_id,
      missionId: mission.id,
      kind: 'system',
      message: `Mission #${String(mission.number).padStart(3, '0')} set to ${parsed.data.priority} priority`,
    });
  }

  return NextResponse.json(updated);
}
