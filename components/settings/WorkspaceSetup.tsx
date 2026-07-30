'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Panel } from '@/components/ui';

/**
 * First run on a real workspace.
 *
 * A fresh Supabase account is genuinely empty — no businesses, no agents, so
 * nothing the command bar can reach. This creates the workforce and only the
 * workforce: the agents, their prompts, their capabilities and their planets.
 *
 * It copies none of the demo's history, and says so, because the alternative
 * would put invented revenue in real finances and invented costs against a real
 * budget — figures that look exactly like measurements and are not.
 */
export function WorkspaceSetup() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function setup() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/workspace/setup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Could not set up the workspace.');
      setDone(body.message);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not set up the workspace.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel className="mb-4 border-sky-500/25 bg-sky-500/[0.06] p-4">
      <p className="text-[13px] font-medium text-sky-100">
        This workspace has no agents yet.
      </p>
      <p className="mt-1 text-[12px] leading-relaxed text-[var(--color-ink-muted)]">
        Set it up and Command Centre will create your workforce — the Commander, the YouTube
        agents, the Etsy agents, the Islamic specialists and the Pokémon Researcher — each with
        its own prompt, capabilities and planet.
      </p>
      <p className="mt-2 text-[12px] leading-relaxed text-[var(--color-ink-muted)]">
        Nothing from the demo comes with them. No missions, no activity, no revenue, no costs, no
        analytics, and every agent starts on zero completed tasks. Your history begins when you
        give your first instruction.
      </p>

      {error && <p className="mt-2 text-[12px] text-red-300">{error}</p>}
      {done && <p className="mt-2 text-[12px] text-emerald-300">{done}</p>}

      <div className="mt-3">
        <Button onClick={setup} disabled={busy}>
          {busy ? 'Setting up…' : 'Set up my workspace'}
        </Button>
      </div>
    </Panel>
  );
}
