'use client';

import { useEffect, useState } from 'react';
import { LogOut, RefreshCw } from 'lucide-react';
import { createSupabaseBrowserClient, supabaseAvailable } from '@/lib/supabase/client';
import { Button } from '@/components/ui';
import { formatRelativeTime } from '@/lib/utils';

interface SessionInfo {
  signedInAt: string | null;
  expiresAt: string | null;
  provider: string | null;
  lastSignInAt: string | null;
}

/**
 * Live session facts, read from the client's own session.
 *
 * Times and the sign-in method only — never the access or refresh token. There
 * is no version of this panel where printing a bearer token to the screen is
 * the right call.
 */
export function SessionPanel() {
  const [info, setInfo] = useState<SessionInfo | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const client = createSupabaseBrowserClient();
    if (!client) return;
    const [{ data: sessionData }, { data: userData }] = await Promise.all([
      client.auth.getSession(),
      client.auth.getUser(),
    ]);
    const session = sessionData.session;
    setInfo({
      signedInAt: userData.user?.created_at ?? null,
      expiresAt: session?.expires_at ? new Date(session.expires_at * 1000).toISOString() : null,
      provider: userData.user?.app_metadata?.provider ?? null,
      lastSignInAt: userData.user?.last_sign_in_at ?? null,
    });
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!supabaseAvailable) {
    return (
      <p className="text-[13px] leading-relaxed text-[var(--color-ink-muted)]">
        Demo mode has no session. Nothing is signed in, nothing is stored, and the dataset resets
        when the server restarts.
      </p>
    );
  }

  const refresh = async () => {
    const client = createSupabaseBrowserClient();
    if (!client) return;
    setRefreshing(true);
    setError(null);
    const { error } = await client.auth.refreshSession();
    if (error) setError(error.message);
    else await load();
    setRefreshing(false);
  };

  return (
    <div className="space-y-3">
      <dl className="grid gap-3 sm:grid-cols-2">
        <Row label="Sign-in method" value={info?.provider ?? '—'} />
        <Row
          label="Last signed in"
          value={info?.lastSignInAt ? formatRelativeTime(info.lastSignInAt) : '—'}
        />
        <Row
          label="Account created"
          value={info?.signedInAt ? formatRelativeTime(info.signedInAt) : '—'}
        />
        <Row
          label="This session expires"
          value={info?.expiresAt ? formatRelativeTime(info.expiresAt) : '—'}
        />
      </dl>

      <p className="text-[12px] leading-relaxed text-[var(--color-ink-faint)]">
        Sessions refresh automatically in the background on every request, so staying signed in on
        a phone or tablet does not require re-entering your password. Access tokens are never
        displayed here.
      </p>

      {error && (
        <p className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-[12px] text-red-300">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={refresh} loading={refreshing}>
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh session
        </Button>
        <form action="/auth/signout" method="post">
          <Button size="sm" variant="danger" type="submit">
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </Button>
        </form>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-[0.1em] text-[var(--color-ink-faint)]">
        {label}
      </dt>
      <dd className="mt-0.5 text-[13px]">{value}</dd>
    </div>
  );
}
