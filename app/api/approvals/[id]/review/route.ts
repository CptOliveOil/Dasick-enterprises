import { NextResponse } from 'next/server';
import { withPermission } from '@/lib/auth/session';
import { buildApprovalReview } from '@/lib/approvals/review';

export const dynamic = 'force-dynamic';

/**
 * The work an approval is asking about.
 *
 * Reads what is already stored. It never calls a provider and never regenerates
 * anything — reviewing a decision must not cost money or change the thing being
 * reviewed.
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
      const review = await buildApprovalReview(store, ownerId, approval);
      return NextResponse.json({ review });
    } catch (error) {
      // Always JSON. An operator who cannot load the detail needs to know the
      // detail failed to load, not be shown an empty panel that looks like
      // "there is nothing to review".
      return NextResponse.json(
        {
          error: 'Could not load what this approval is asking about.',
          detail: error instanceof Error ? error.message : String(error),
        },
        { status: 500 },
      );
    }
  });
}
