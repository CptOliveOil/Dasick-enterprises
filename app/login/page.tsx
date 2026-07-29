'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createSupabaseBrowserClient, supabaseAvailable } from '@/lib/supabase/client';
import { AuthShell } from '@/components/auth/AuthShell';
import { Button, Field, inputClass } from '@/components/ui';

/**
 * Sign-in.
 *
 * Without Supabase there is no account system — the app runs on the seeded
 * demo dataset — so this page says so rather than showing a form that cannot
 * work.
 */
export default function LoginPage() {
  return (
    <Suspense fallback={<div className="starfield min-h-dvh" />}>
      {supabaseAvailable ? <SignIn /> : <DemoNotice />}
    </Suspense>
  );
}

function DemoNotice() {
  return (
    <AuthShell
      title="Demo mode"
      subtitle="Supabase is not configured, so Command Centre is running on a seeded in-memory dataset and there is no account to sign in to."
    >
      <p className="text-[12px] leading-relaxed text-[var(--color-ink-faint)]">
        Set <code className="font-mono text-amber-300">NEXT_PUBLIC_SUPABASE_URL</code> and{' '}
        <code className="font-mono text-amber-300">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>, run the
        migrations in <code className="font-mono">supabase/migrations</code>, and this becomes a
        real sign-in.
      </p>
      <Link href="/" className="mt-5 block">
        <Button variant="primary" className="w-full">
          Continue to the demo
        </Button>
      </Link>
    </AuthShell>
  );
}

function SignIn() {
  const params = useSearchParams();
  // Only same-origin paths, so `?next=` cannot be used to bounce a signed-in
  // operator off to somebody else's site.
  const raw = params.get('next') ?? '/';
  const next = raw.startsWith('/') && !raw.startsWith('//') ? raw : '/';
  const initialError = params.get('error');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(initialError);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const client = createSupabaseBrowserClient();
    if (!client) return;
    setBusy(true);
    setError(null);
    try {
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      // A full navigation, so the middleware sees the new session cookies and
      // the first render of the galaxy is already authenticated.
      window.location.href = next;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed.');
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title="Sign in"
      subtitle="This is a private workspace."
      footer={
        <Link href="/forgot-password" className="underline-offset-4 hover:underline">
          Forgot your password?
        </Link>
      }
    >
      <form onSubmit={submit}>
        <div className="space-y-3">
          <Field label="Email">
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className={inputClass}
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
            />
          </Field>
          <Field label="Password">
            <input
              type="password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={inputClass}
              autoComplete="current-password"
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

        <Button type="submit" variant="primary" className="mt-4 w-full" loading={busy}>
          Sign in
        </Button>
      </form>
    </AuthShell>
  );
}
