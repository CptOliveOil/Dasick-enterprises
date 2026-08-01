import { NextResponse } from 'next/server';
import { withPermission } from '@/lib/auth/session';
import { traceMission } from '@/lib/workflows/trace';

export const dynamic = 'force-dynamic';

/**
 * The mission graph with every reference checked.
 *
 * Diagnostic, read-only, and free: it calls no provider and writes nothing. It
 * exists because establishing "is the script actually missing, or merely
 * unreferenced?" previously meant reading five tables by hand, and those two
 * answers have completely different causes.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return withPermission('businesses.view', async ({ store, ownerId }) => {
    const mission = await store.get('missions', id).catch(() => null);
    if (!mission || mission.owner_id !== ownerId) {
      return NextResponse.json({ error: 'Mission not found.' }, { status: 404 });
    }
    try {
      return NextResponse.json({ trace: await traceMission(store, mission) });
    } catch (error) {
      return NextResponse.json(
        {
          error: 'Could not trace this mission.',
          detail: error instanceof Error ? error.message : String(error),
        },
        { status: 500 },
      );
    }
  });
}
