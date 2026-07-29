'use client';

import Link from 'next/link';
import { useState } from 'react';
import { createSupabaseBrowserClient, supabaseAvailable } from '@/lib/supabase/client';
import { AuthShell } from '@/components/auth/AuthShell';
import { Button, Field, inputClass } from '@/components/ui';

/**
 * Requests a password-reset email.
 *
 * The response is deliberately the same whether or not the address has an
 * account: telling an anonymous visitor which emails are registered is a
 * disclosure with no upside on a single-owner application.
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const client = createSupabaseBrowserClient();
    if (!client) return;
    setBusy(true);
    setError(null);
    try {
      const { error } = await client.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
      });
      // A rate-limit is worth surfacing; "no such user" is not, and Supabase
      // does not report it here anyway.
      if (error && error.status === 429) throw error;
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The reset email could not be sent.');
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <AuthShell
        title="Check your inbox"
        subtitle={`If ${email} has a Command Centre account, a reset link is on its way. The link is single-use and expires.`}
        footer={
          <Link href="/login" className="underline-offset-4 hover:underline">
            Back to sign in
          </Link>
        }
      >
        <p className="text-[12px] leading-relaxed text-[var(--color-ink-faint)]">
          Nothing arrived? Check spam, then confirm the address and try again. The reset email is
          sent by Supabase using whatever SMTP your project is configured with.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Reset your password"
      subtitle="We will email you a single-use link."
      footer={
        <Link href="/login" className="underline-offset-4 hover:underline">
          Back to sign in
        </Link>
      }
    >
      <form onSubmit={submit}>
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

        {error && (
          <p
            role="alert"
            className="mt-3 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-[12px] leading-snug text-red-300"
          >
            {error}
          </p>
        )}

        <Button type="submit" variant="primary" className="mt-4 w-full" loading={busy}>
          Send reset link
        </Button>
      </form>
    </AuthShell>
  );
}
