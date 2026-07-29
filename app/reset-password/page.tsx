'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createSupabaseBrowserClient, supabaseAvailable } from '@/lib/supabase/client';
import { AuthShell } from '@/components/auth/AuthShell';
import { Button, Field, inputClass } from '@/components/ui';

const MIN_LENGTH = 10;

/**
 * Sets a new password.
 *
 * Reaching this page means the recovery link has already been exchanged for a
 * session by /auth/callback, so this is an ordinary `updateUser` — there is no
 * token in the URL to leak through a referrer or a screenshot.
 */
export default function ResetPasswordPage() {
  const [ready, setReady] = useState<boolean | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const client = createSupabaseBrowserClient();
    if (!client) {
      setReady(false);
      return;
    }
    client.auth.getSession().then(({ data }) => setReady(Boolean(data.session)));
  }, []);

  if (!supabaseAvailable) {
    return (
      <AuthShell
        title="Nothing to reset"
        subtitle="Command Centre is running in demo mode with no account system."
      >
        <Link href="/" className="block">
          <Button variant="primary" className="w-full">
            Continue to the demo
          </Button>
        </Link>
      </AuthShell>
    );
  }

  if (ready === false) {
    return (
      <AuthShell
        title="This link is no longer valid"
        subtitle="Reset links are single-use and expire. Request a new one."
        footer={
          <Link href="/login" className="underline-offset-4 hover:underline">
            Back to sign in
          </Link>
        }
      >
        <Link href="/forgot-password" className="block">
          <Button variant="primary" className="w-full">
            Send a new link
          </Button>
        </Link>
      </AuthShell>
    );
  }

  if (done) {
    return (
      <AuthShell
        title="Password changed"
        subtitle="Every other device has been signed out. Sign in again with your new password."
      >
        <Link href="/login" className="block">
          <Button variant="primary" className="w-full">
            Go to sign in
          </Button>
        </Link>
      </AuthShell>
    );
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    if (password.length < MIN_LENGTH) {
      setError(`Use at least ${MIN_LENGTH} characters.`);
      return;
    }
    const client = createSupabaseBrowserClient();
    if (!client) return;
    setBusy(true);
    setError(null);
    try {
      const { error } = await client.auth.updateUser({ password });
      if (error) throw error;
      // A password change should end sessions the operator may not control.
      await client.auth.signOut({ scope: 'global' });
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The password could not be changed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Choose a new password" subtitle={`At least ${MIN_LENGTH} characters.`}>
      <form onSubmit={submit}>
        <div className="space-y-3">
          <Field label="New password">
            <input
              type="password"
              required
              minLength={MIN_LENGTH}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={inputClass}
              autoComplete="new-password"
            />
          </Field>
          <Field label="Confirm new password">
            <input
              type="password"
              required
              minLength={MIN_LENGTH}
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              className={inputClass}
              autoComplete="new-password"
            />
          </Field>
        </div>

        {error && (
          <p
            role="alert"
            className="mt-3 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-[12px] leading-snug text-red-300"
          >
            {error}
          </p>
        )}

        <Button
          type="submit"
          variant="primary"
          className="mt-4 w-full"
          loading={busy || ready === null}
        >
          Change password
        </Button>
      </form>
    </AuthShell>
  );
}
