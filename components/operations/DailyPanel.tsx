'use client';

import { useCallback, useEffect, useState } from 'react';
import { Lightbulb, RefreshCw, Sparkles } from 'lucide-react';
import { useWorkforce } from '@/lib/store/workforce';
import { formatMoneyPrecise } from '@/lib/utils';
import { Badge, Button, EmptyState, Panel, PanelHeader } from '@/components/ui';
import { NeedsYou } from './NeedsYou';
import { Briefing } from './Briefing';
import type { NeedsYouItem } from '@/lib/operations/needs-you';
import type { TodaySummary } from '@/lib/operations/today';
import type { DailyBriefing, Recommendation } from '@/schemas/manager-ops';

interface Operations {
  displayName: string;
  needsYou: NeedsYouItem[];
  today: TodaySummary;
  suggestions: { label: string; command: string; reason: string }[];
}

/**
 * The daily operating panel.
 *
 * Answers, in order: what is waiting on you, what happened today, and what to
 * do next. Everything on it comes from `/api/operations`, which reads real
 * records — the briefing and recommendations are produced by the Manager
 * running through the ordinary agent engine, never by this component calling a
 * model.
 */
export function DailyPanel({ compact }: { compact?: boolean }) {
  const [ops, setOps] = useState<Operations | null>(null);
  const [briefing, setBriefing] = useState<DailyBriefing | null>(null);
  const [recommendations, setRecommendations] = useState<Recommendation[] | null>(null);
  const [note, setNote] = useState<string>('');
  const [running, setRunning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const version = useWorkforce((s) => s.snapshot?.version);
  const setCommand = useWorkforce((s) => s.setDraftCommand);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/operations');
      if (!response.ok) return;
      setOps(await response.json());
    } catch {
      // The panel is supplementary; a failed poll should not break the page.
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, version]);

  const run = async (action: 'briefing' | 'recommendations') => {
    setRunning(action);
    setError(null);
    try {
      const response = await fetch('/api/operations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'The Manager could not do that.');
      if (action === 'briefing') {
        setBriefing(data.output?.briefing ?? null);
      } else {
        setRecommendations(data.output?.recommendations?.recommendations ?? []);
        setNote(data.output?.recommendations?.note ?? '');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The Manager could not do that.');
    } finally {
      setRunning(null);
    }
  };

  const today = ops?.today;

  return (
    <div className="space-y-3">
      <Greeting name={ops?.displayName ?? null} needsYou={ops?.needsYou.length ?? 0} />

      <NeedsYou items={ops?.needsYou ?? []} compact={compact} onChanged={load} />

      {today && (
        <Panel>
          <PanelHeader title="Today" />
          <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 px-3.5 py-3 sm:grid-cols-3">
            <Stat label="Completed" value={today.completed} />
            <Stat label="Working" value={today.working} tone={today.working > 0 ? '#38bdf8' : undefined} />
            <Stat label="Queued" value={today.queued} />
            <Stat label="Waiting" value={today.waiting} />
            <Stat label="Failed" value={today.failed} tone={today.failed > 0 ? '#f87171' : undefined} />
            <Stat
              label="AI spend"
              value={formatMoneyPrecise(today.aiSpend, today.currency)}
            />
            <Stat
              label="Production spend"
              value={formatMoneyPrecise(today.productionSpend, today.currency)}
            />
            {/* Null means no underlying data — rendered as an em dash, never as
                a confident zero. */}
            <Stat label="Videos ready" value={today.videosCompleted} />
            <Stat label="Ideas generated" value={today.ideasGenerated} />
          </div>
        </Panel>
      )}

      <Panel>
        <PanelHeader
          title="Daily briefing"
          action={
            <Button size="sm" variant="secondary" loading={running === 'briefing'} onClick={() => run('briefing')}>
              {briefing ? <RefreshCw className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
              {briefing ? 'Refresh' : 'Generate'}
            </Button>
          }
        />
        <div className="px-3.5 py-3">
          {error && (
            <p className="mb-2 rounded-lg border border-red-500/25 bg-red-500/10 px-2.5 py-1.5 text-[12px] leading-snug text-red-300">
              {error}
            </p>
          )}
          {briefing ? (
            <Briefing briefing={briefing} />
          ) : (
            <p className="text-[12px] leading-relaxed text-[var(--color-ink-muted)]">
              The Manager reads your actual missions, approvals, costs and failures and writes what
              matters. It is given a digest of real state and told that anything not in it did not
              happen.
            </p>
          )}
        </div>
      </Panel>

      <Panel>
        <PanelHeader
          title="What should I do next?"
          action={
            <Button
              size="sm"
              variant="secondary"
              loading={running === 'recommendations'}
              onClick={() => run('recommendations')}
            >
              <Lightbulb className="h-3.5 w-3.5" />
              {recommendations ? 'Again' : 'Ask'}
            </Button>
          }
        />
        <div className="px-3.5 py-3">
          {recommendations === null ? (
            <p className="text-[12px] leading-relaxed text-[var(--color-ink-muted)]">
              Ranked by what is actually holding work up, drawn from real state — never generic
              advice.
            </p>
          ) : recommendations.length === 0 ? (
            <p className="text-[12px] text-[var(--color-ink-muted)]">
              {note || 'Nothing needs doing right now.'}
            </p>
          ) : (
            <ol className="space-y-2.5">
              {recommendations.map((item, index) => (
                <li key={index} className="flex gap-2.5">
                  <span className="mt-0.5 font-mono text-[11px] text-amber-400">{index + 1}</span>
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[13px] font-medium">{item.title}</span>
                      <Badge
                        tone={
                          item.urgency === 'critical'
                            ? 'red'
                            : item.urgency === 'high'
                              ? 'amber'
                              : 'neutral'
                        }
                      >
                        {item.urgency}
                      </Badge>
                      {item.related_business && <Badge>{item.related_business}</Badge>}
                    </span>
                    <span className="mt-0.5 block text-[12px] leading-relaxed text-[var(--color-ink-muted)]">
                      {item.reason}
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-[var(--color-ink-faint)]">
                      {item.suggested_action}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </Panel>

      {ops && ops.suggestions.length > 0 && (
        <Panel>
          <PanelHeader title="Quick commands" />
          <div className="flex flex-wrap gap-1.5 px-3.5 py-3">
            {ops.suggestions.map((suggestion) => (
              <button
                key={suggestion.label}
                type="button"
                title={suggestion.reason}
                // Fills the command bar. Nothing runs until the operator sends it.
                onClick={() => setCommand(suggestion.command)}
                className="rounded-full border border-[var(--color-edge)] bg-white/[0.03] px-2.5 py-1 text-[11px] text-[var(--color-ink-muted)] transition-colors hover:bg-white/[0.07] hover:text-[var(--color-ink)]"
              >
                {suggestion.label}
              </button>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}

function Greeting({ name, needsYou }: { name: string | null; needsYou: number }) {
  const hour = new Date().getHours();
  const part = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const agents = useWorkforce((s) => s.snapshot?.metrics.agentsActive) ?? 0;
  const working = useWorkforce((s) => s.snapshot?.metrics.tasksRunning) ?? 0;

  return (
    <div className="px-1">
      <h2 className="text-[15px] font-semibold">
        {part}
        {name ? `, ${name.split(' ')[0]}` : ''}
      </h2>
      <p className="mt-0.5 text-[12px] leading-relaxed text-[var(--color-ink-muted)]">
        {working > 0
          ? `Your workforce is active — ${working} task${working === 1 ? '' : 's'} running across ${agents} agent${agents === 1 ? '' : 's'}.`
          : 'Your workforce is idle.'}{' '}
        {needsYou > 0
          ? `${needsYou} item${needsYou === 1 ? '' : 's'} need${needsYou === 1 ? 's' : ''} your attention.`
          : 'Nothing needs your attention.'}
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string | null;
  tone?: string;
}) {
  return (
    <div>
      <p
        className="text-[15px] font-semibold tabular-nums"
        style={tone ? { color: tone } : undefined}
      >
        {value === null ? <span className="text-[var(--color-ink-faint)]">—</span> : value}
      </p>
      <p className="text-[10px] uppercase tracking-[0.1em] text-[var(--color-ink-faint)]">
        {label}
      </p>
    </div>
  );
}
