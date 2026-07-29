import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withPermission } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

const patchSchema = z.object({
  display_name: z.string().trim().min(1).max(80).optional(),
  timezone: z.string().trim().min(1).max(64).optional(),
  currency: z.string().trim().length(3).toUpperCase().optional(),
});

/**
 * Updates the operator's own profile.
 *
 * Deliberately narrow: `role` is not accepted from the browser. Letting an
 * account edit its own role is how a viewer becomes an owner.
 */
export async function PATCH(request: Request) {
  return withPermission('account.manage', async ({ store, ownerId }) => {
    const parsed = patchSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Those account details are not valid.' }, { status: 400 });
    }
    if (Object.keys(parsed.data).length === 0) {
      return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 });
    }

    const updated = await store.update('profiles', ownerId, {
      ...parsed.data,
      updated_at: new Date().toISOString(),
    });
    return NextResponse.json(updated);
  });
}
