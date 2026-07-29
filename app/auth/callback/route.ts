import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/** Only same-origin destinations, so the callback cannot be used as an open redirect. */
function safeNext(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/';
  return value;
}

/**
 * Exchanges an emailed code for a session.
 *
 * Recovery links land here too. Those must go to /reset-password rather than
 * the dashboard: the session they create exists so the operator can set a new
 * password, and dropping them on the galaxy instead would leave the old
 * password in place.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const type = url.searchParams.get('type');
  const next = type === 'recovery' ? '/reset-password' : safeNext(url.searchParams.get('next'));

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
