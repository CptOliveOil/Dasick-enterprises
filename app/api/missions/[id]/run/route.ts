import { NextResponse } from 'next/server';
import { getStore } from '@/lib/db';
import { runMission } from '@/lib/workflows/runner';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { store, ownerId } = await getStore();

  const mission = await store.get('missions', id);
  if (!mission || mission.owner_id !== ownerId) {
    return NextResponse.json({ error: 'Mission not found.' }, { status: 404 });
  }

  try {
    const run = await runMission(store, ownerId, id);
    return NextResponse.json(run);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'The mission could not be advanced.' },
      { status: 500 },
    );
  }
}
