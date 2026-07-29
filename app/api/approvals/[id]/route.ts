import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guardPermission } from '@/lib/auth/session';
import { ApprovalRefused, resolveApproval } from '@/lib/workflows/approvals';
import { runMission } from '@/lib/workflows/runner';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const bodySchema = z.object({
  decision: z.enum(['approve', 'reject', 'request_changes']),
  feedback: z.string().max(2000).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid decision.' }, { status: 400 });
  }
  if (parsed.data.decision === 'request_changes' && !parsed.data.feedback?.trim()) {
    return NextResponse.json(
      { error: 'Say what needs to change so the agent has something to work from.' },
      { status: 400 },
    );
  }

  const guard = await guardPermission('tasks.approve');
  if ('response' in guard) return guard.response;
  const { store, ownerId } = guard;
  const existing = await store.get('approvals', id);
  if (!existing || existing.owner_id !== ownerId) {
    return NextResponse.json({ error: 'Approval not found.' }, { status: 404 });
  }

  try {
    const result = await resolveApproval(
      store,
      ownerId,
      id,
      parsed.data.decision,
      parsed.data.feedback,
    );

    const run =
      result.shouldContinue && result.missionId
        ? await runMission(store, ownerId, result.missionId)
        : null;

    return NextResponse.json({ approval: result.approval, run });
  } catch (error) {
    // A rule refusing the decision is a conflict, not a server fault. The
    // message is written for the operator, so it is passed through as-is.
    if (error instanceof ApprovalRefused) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'The approval could not be resolved.' },
      { status: 500 },
    );
  }
}
