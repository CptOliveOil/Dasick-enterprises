import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/** Exchanges the emailed code for a session, then returns the operator home. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next') ?? '/';

  if (code) {
    const client = await createSupabaseServerClient();
    if (client) {
      const { error } = await client.auth.exchangeCodeForSession(code);
      if (error) {
        return NextResponse.redirect(
          new URL(`/login?error=${encodeURIComponent(error.message)}`, url.origin),
        );
      }
    }
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
