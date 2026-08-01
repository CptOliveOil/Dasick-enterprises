import { NextResponse } from 'next/server';
import { guardPermission } from '@/lib/auth/session';
import { runMission } from '@/lib/workflows/runner';
import { dataErrorResponse } from '@/lib/api/errors';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const guard = await guardPermission('missions.create');
  if ('response' in guard) return guard.response;
  const { store, ownerId } = guard;

  const mission = await store.get('missions', id);
  if (!mission || mission.owner_id !== ownerId) {
    return NextResponse.json({ error: 'Mission not found.' }, { status: 404 });
  }

  try {
    const run = await runMission(store, ownerId, id);
    return NextResponse.json(run);
  } catch (error) {
    const data = dataErrorResponse(error);
    if (data) return data;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'The mission could not be advanced.' },
      { status: 500 },
    );
  }
}
