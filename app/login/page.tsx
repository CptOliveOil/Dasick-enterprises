'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createSupabaseBrowserClient, supabaseAvailable } from '@/lib/supabase/client';
import { Button, Field, Panel, inputClass } from '@/components/ui';

/**
 * Command Centre is a private application. Without Supabase configured there is
 * no account system at all — the app runs on the seeded demo dataset — so this
 * page says that rather than showing a form that cannot work.
 */
export default function LoginPage() {
  return (
    <Suspense fallback={<div className="starfield min-h-dvh" />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const params = useSearchParams();
  const next = params.get('next') ?? '/';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'password' | 'link'>('password');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const client = createSupabaseBrowserClient();
    if (!client) return;
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      if (mode === 'link') {
        const { error } = await client.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${next}` },
        });
        if (error) throw error;
        setStatus('Check your inbox for a sign-in link.');
      } else {
        const { error } = await client.auth.signInWithPassword({ email, password });
        if (error) throw error;
        window.location.href = next;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="starfield flex min-h-dvh items-center justify-center px-4">
      <Panel className="w-full max-w-sm p-6">
        <div className="mb-5 flex items-center gap-2.5">
          <span className="relative flex h-6 w-6 items-center justify-center">
            <span className="absolute inset-0 rounded-full bg-amber-400/25 blur-[6px]" />
            <span className="relative h-3 w-3 rounded-full bg-amber-400" />
          </span>
          <span className="text-[13px] font-semibold uppercase tracking-[0.16em]">
            Command Centre
          </span>
        </div>

        {!supabaseAvailable ? (
          <>
            <h1 className="text-[15px] font-semibold">No account system configured</h1>
            <p className="mt-2 text-[13px] leading-relaxed text-[var(--color-ink-muted)]">
              Supabase is not set up, so Command Centre is running in demo mode on a seeded
              in-memory dataset and there is nothing to sign in to.
            </p>
            <p className="mt-2 text-[12px] leading-relaxed text-[var(--color-ink-faint)]">
              Set <code className="font-mono">NEXT_PUBLIC_SUPABASE_URL</code> and{' '}
              <code className="font-mono">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>, run the migration
              in <code className="font-mono">supabase/migrations</code>, and this page becomes a
              real sign-in.
            </p>
            <a href="/" className="mt-5 block">
              <Button variant="primary" className="w-full">
                Continue to demo
              </Button>
            </a>
          </>
        ) : (
          <form onSubmit={submit}>
            <h1 className="text-[15px] font-semibold">Sign in</h1>
            <p className="mt-1 text-[12px] text-[var(--color-ink-muted)]">
              This is a private workspace.
            </p>

            <div className="mt-4 space-y-3">
              <Field label="Email">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className={inputClass}
                  autoComplete="email"
                />
              </Field>

              {mode === 'password' && (
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
              )}
            </div>

            {error && (
              <p className="mt-3 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-[12px] text-red-300">
                {error}
              </p>
            )}
            {status && (
              <p className="mt-3 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-[12px] text-emerald-300">
                {status}
              </p>
            )}

            <Button type="submit" variant="primary" className="mt-4 w-full" loading={busy}>
              {mode === 'password' ? 'Sign in' : 'Send sign-in link'}
            </Button>

            <button
              type="button"
              onClick={() => setMode(mode === 'password' ? 'link' : 'password')}
              className="mt-3 w-full text-center text-[12px] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
            >
              {mode === 'password' ? 'Email me a sign-in link instead' : 'Use a password instead'}
            </button>
          </form>
        )}
      </Panel>
    </div>
  );
}
