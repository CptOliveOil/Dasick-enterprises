'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, inputClass, Panel } from '@/components/ui';
import type { AiBudget } from '@/types/budget';

/**
 * Where the owner chooses what the workforce may spend.
 *
 * Deliberately blank on first use. There is no suggested figure and no
 * pre-filled ceiling, because a number Command Centre chose would be Command
 * Centre deciding how much of someone else's money to risk. The operator types
 * one, and until they do, nothing paid runs at all.
 */
export function AiBudgetForm({
  budget,
  spentThisMonth,
  currency,
}: {
  budget: AiBudget | null;
  spentThisMonth: number;
  currency: string;
}) {
  const router = useRouter();
  const [monthly, setMonthly] = useState(budget ? String(budget.monthly_ceiling) : '');
  const [perMission, setPerMission] = useState(
    budget ? String(budget.per_mission_ceiling) : '',
  );
  const [approvalOver, setApprovalOver] = useState(
    budget ? String(budget.approval_over) : '',
  );
  const [warnAt, setWarnAt] = useState(String(budget?.warn_at_percent ?? 80));
  const [activate, setActivate] = useState(Boolean(budget?.activated_at));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const symbol = currency === 'GBP' ? '£' : currency === 'USD' ? '$' : '';
  const active = Boolean(budget?.activated_at);
  const used = budget ? Math.min(100, (spentThisMonth / budget.monthly_ceiling) * 100) : 0;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const response = await fetch('/api/settings/ai-budget', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          currency,
          monthly_ceiling: Number(monthly),
          per_mission_ceiling: Number(perMission),
          approval_over: Number(approvalOver),
          warn_at_percent: Number(warnAt),
          activate,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.detail ?? body.error ?? 'Could not save.');
      setSaved(true);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <Panel
        className={
          active
            ? 'border-emerald-500/25 bg-emerald-500/[0.06] p-4'
            : 'border-amber-500/25 bg-amber-500/[0.07] p-4'
        }
      >
        {active && budget ? (
          <>
            <p className="text-[13px] font-medium text-emerald-100">
              Paid AI execution is on, with a {symbol}
              {budget.monthly_ceiling.toFixed(2)} monthly ceiling.
            </p>
            <p className="mt-1 text-[12px] leading-relaxed text-[var(--color-ink-muted)]">
              {symbol}
              {spentThisMonth.toFixed(2)} spent this month ({used.toFixed(0)}% of the ceiling).
              Warnings begin at {budget.warn_at_percent}%. At the ceiling, work stops — approval
              does not override it.
            </p>
          </>
        ) : (
          <>
            <p className="text-[13px] font-medium text-amber-100">
              No AI budget is set, so nothing paid will run.
            </p>
            <p className="mt-1 text-[12px] leading-relaxed text-[var(--color-ink-muted)]">
              Choose a monthly ceiling you would be comfortable losing, and turn execution on.
              Command Centre has no default figure on purpose — a limit you did not choose is not
              a limit. You can change these at any time, and only you can.
            </p>
          </>
        )}
      </Panel>

      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={`Monthly ceiling (${currency})`}
            hint="A hard stop across the whole workforce. Nothing runs past it."
          >
            <input
              className={inputClass}
              type="number"
              min="1"
              step="1"
              required
              placeholder="e.g. 20"
              value={monthly}
              onChange={(event) => setMonthly(event.target.value)}
            />
          </Field>

          <Field
            label={`Per-mission ceiling (${currency})`}
            hint="Stops one runaway mission from spending the whole month."
          >
            <input
              className={inputClass}
              type="number"
              min="0.01"
              step="0.01"
              required
              placeholder="e.g. 2"
              value={perMission}
              onChange={(event) => setPerMission(event.target.value)}
            />
          </Field>

          <Field
            label={`Ask me above (${currency})`}
            hint="A single step estimated at or above this stops for your approval first."
          >
            <input
              className={inputClass}
              type="number"
              min="0.01"
              step="0.01"
              required
              placeholder="e.g. 0.50"
              value={approvalOver}
              onChange={(event) => setApprovalOver(event.target.value)}
            />
          </Field>

          <Field label="Warn me at (%)" hint="Where the warnings start, as a share of the ceiling.">
            <input
              className={inputClass}
              type="number"
              min="1"
              max="100"
              step="1"
              required
              value={warnAt}
              onChange={(event) => setWarnAt(event.target.value)}
            />
          </Field>
        </div>

        <label className="flex items-start gap-3 rounded-lg border border-[var(--color-edge)] bg-white/[0.02] px-4 py-3">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={activate}
            onChange={(event) => setActivate(event.target.checked)}
          />
          <span className="text-[13px]">
            Turn on paid AI execution
            <span className="mt-0.5 block text-[12px] text-[var(--color-ink-muted)]">
              Until this is ticked, agents will not call a paid model at all. Untick it at any time
              to stop all spending without losing these figures.
            </span>
          </span>
        </label>

        {error && <p className="text-[12px] text-red-300">{error}</p>}
        {saved && !error && (
          <p className="text-[12px] text-emerald-300">Saved. This takes effect immediately.</p>
        )}

        <Button type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save budget'}
        </Button>
      </form>

      <p className="text-[12px] leading-relaxed text-[var(--color-ink-faint)]">
        Only you can change these. No agent can reach this setting: agents run inside tasks and
        have no session of their own, the route that writes it requires the owner role, and the
        database policy behind it is owner-only. An agent that decides it needs a bigger budget can
        ask you for one — it cannot grant itself one.
      </p>
    </div>
  );
}
