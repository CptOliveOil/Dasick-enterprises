import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth/session';
import { workspaceCookieName } from '@/lib/db/workspace';
import { BUSINESS_KINDS } from '@/types/domain';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  kind: z.enum(BUSINESS_KINDS),
  business_id: z.string().uuid(),
});

/**
 * Chooses which business a workspace shows when an account has more than one of
 * a kind — a second YouTube channel, say.
 *
 * The cookie is set here rather than in the browser so it can be validated
 * first: only a business this account owns is ever written.
 */
export async function POST(request: Request) {
  const { store, ownerId } = await getSession();
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid workspace selection.' }, { status: 400 });
  }

  const business = await store.get('businesses', parsed.data.business_id);
  if (!business || business.owner_id !== ownerId || business.kind !== parsed.data.kind) {
    return NextResponse.json({ error: 'That workspace does not exist.' }, { status: 404 });
  }

  const response = NextResponse.json({ business_id: business.id, name: business.name });
  response.cookies.set(workspaceCookieName(business.kind), business.id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}
