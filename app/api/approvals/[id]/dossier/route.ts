import { NextResponse } from 'next/server';
import { withPermission } from '@/lib/auth/session';
import { buildDossier } from '@/lib/approvals/dossier';

export const dynamic = 'force-dynamic';

/**
 * Everything an operator needs in order to decide.
 *
 * Reads only. It never calls a provider, never regenerates anything and never
 * changes the work being reviewed — opening a review must not cost money, and
 * an operator who reads an approval twice must see the same thing twice.
 *
 * The one write it can cause is inside Business Intelligence Memory, which
 * refreshes an outcome row from analytics that already exist. No model, no
 * spend.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return withPermission('businesses.view', async ({ store, ownerId }) => {
    try {
      const approval = await store.get('approvals', id).catch(() => null);
      if (!approval || approval.owner_id !== ownerId) {
        return NextResponse.json({ error: 'No such approval.' }, { status: 404 });
      }
      const dossier = await buildDossier(store, ownerId, approval);
      return NextResponse.json({ dossier });
    } catch (error) {
      // Always JSON. An operator who cannot load the review needs to be told it
      // failed to load, not shown an empty page that reads like "there was
      // nothing to review".
      return NextResponse.json(
        {
          error: 'Could not assemble the review for this approval.',
          detail: error instanceof Error ? error.message : String(error),
        },
        { status: 500 },
      );
    }
  });
}
