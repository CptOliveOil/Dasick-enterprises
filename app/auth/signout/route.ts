import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Signs out server-side so the session cookies are cleared by the response
 * rather than by client JavaScript that may not run.
 *
 * POST only: a GET would let any page on the internet sign the operator out by
 * embedding an image.
 */
export async function POST(request: Request) {
  const client = await createSupabaseServerClient();
  if (client) await client.auth.signOut();
  return NextResponse.redirect(new URL('/login', new URL(request.url).origin), {
    status: 303,
  });
}
