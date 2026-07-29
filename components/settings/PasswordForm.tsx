'use client';

import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { createSupabaseBrowserClient, supabaseAvailable } from '@/lib/supabase/client';
import { Button, Field, inputClass } from '@/components/ui';

const MIN_LENGTH = 10;

/**
 * Changes the password from inside the app.
 *
 * The current password is re-checked by signing in with it first. Supabase's
 * `updateUser` does not require it, which means a borrowed unlocked laptop
 * would be enough to lock the owner out of their own account.
 */
export function PasswordForm({ email }: { email: string }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  if (!supabaseAvailable) {
    return (
      <p className="text-[13px] leading-relaxed text-[var(--color-ink-muted)]">
        Demo mode has no account, so there is no password to change. Configure Supabase to turn
        this into a real sign-in.
      </p>
    );
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);
    if (next !== confirm) {
      setMessage({ ok: false, text: 'The two new passwords do not match.' });
      return;
    }
    if (next.length < MIN_LENGTH) {
      setMessage({ ok: false, text: `Use at least ${MIN_LENGTH} characters.` });
      return;
    }
    const client = createSupabaseBrowserClient();
    if (!client) return;

    setBusy(true);
    try {
      const check = await client.auth.signInWithPassword({ email, password: current });
      if (check.error) throw new Error('That is not your current password.');

      const { error } = await client.auth.updateUser({ password: next });
      if (error) throw error;

      setMessage({
        ok: true,
        text: 'Password changed. Other devices stay signed in — sign out everywhere if you want them cleared.',
      });
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (error) {
      setMessage({
        ok: false,
        text: error instanceof Error ? error.message : 'The password could not be changed.',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Current password">
          <input
            type="password"
            required
            value={current}
            onChange={(event) => setCurrent(event.target.value)}
            className={inputClass}
            autoComplete="current-password"
          />
        </Field>
        <Field label="New password">
          <input
            type="password"
            required
            minLength={MIN_LENGTH}
            value={next}
            onChange={(event) => setNext(event.target.value)}
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

      {message && (
        <p
          className={`rounded-lg border px-3 py-2 text-[12px] leading-snug ${
            message.ok
              ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300'
              : 'border-red-500/25 bg-red-500/10 text-red-300'
          }`}
        >
          {message.text}
        </p>
      )}

      <Button type="submit" size="sm" loading={busy}>
        <KeyRound className="h-3.5 w-3.5" />
        Change password
      </Button>
    </form>
  );
}
