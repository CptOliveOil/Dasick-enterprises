'use client';

import { Play, RotateCw, X } from 'lucide-react';
import { useState } from 'react';
import { useWorkforce } from '@/lib/store/workforce';
import { describeTaskLifecycle, MISSION_STATUS_STYLES, TASK_STATUS_STYLES } from '@/lib/agents/status';
import { missionLabel } from '@/lib/utils';
import { Badge, Button, DemoNotice, ProgressBar } from '@/components/ui';
import type { Mission } from '@/types/domain';

/**
 * A mission and its steps. Selecting a mission also highlights the planets
 * involved in the galaxy, so the two views stay in sync.
 */
export function MissionInspector({
  mission,
  onClose,
}: {
  mission: Mission;
  onClose?: () => void;
}) {
  const snapshot = useWorkforce((s) => s.snapshot);
  const refresh = useWorkforce((s) => s.refresh);
  const setBusy = useWorkforce((s) => s.setBusy);
  const select = useWorkforce((s) => s.select);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tasks = (snapshot?.tasks ?? [])
    .filter((t) => t.mission_id === mission.id)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const business = snapshot?.businesses.find((b) => b.id === mission.business_id) ?? null;
  const style = MISSION_STATUS_STYLES[mission.status];
  const advanceable = ['planning', 'running', 'waiting'].includes(mission.status);
  // Anything that stopped part-way can be picked up: a failed step, or a step
  // cancelled because one upstream of it failed.
  const retryable = tasks.some(
    (task) =>
      task.status === 'failed' ||
      (task.status === 'cancelled' &&
        task.error === 'An upstream step failed, so this step was cancelled.'),
  );

  /**
   * Picks up a mission that stopped part-way.
   *
   * Re-queues the failed steps and the ones cancelled behind them, and leaves
   * completed steps exactly as they are — so nothing is regenerated, nothing is
   * duplicated, and no model is called again for work already paid for.
   */
  const retry = async () => {
    setRunning(true);
    setBusy('Retrying failed steps');
    setError(null);
    try {
      const response = await fetch(`/api/missions/${mission.id}/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'retry_mission' }),
      });
      const raw = await response.text();
      const data = raw ? JSON.parse(raw) : {};
      if (!response.ok) throw new Error(data.error ?? 'The mission could not be retried.');
      if (data.run?.haltedBecause) setError(data.run.haltedBecause);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The mission could not be retried.');
    } finally {
      setRunning(false);
      setBusy(null);
      await refresh();
    }
  };

  const advance = async () => {
    setRunning(true);
    setBusy('Advancing mission');
    setError(null);
    try {
      const response = await fetch(`/api/missions/${mission.id}/run`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'The mission could not be advanced.');
      if (data.haltedBecause) setError(data.haltedBecause);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The mission could not be advanced.');
    } finally {
      setRunning(false);
      setBusy(null);
      await refresh();
    }
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-start gap-3 border-b border-[var(--color-edge-soft)] p-4">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[11px] tracking-[0.1em] text-amber-400">
            MISSION {missionLabel(mission.number)}
          </p>
          <h2 className="mt-0.5 text-[15px] font-semibold leading-snug">{mission.title}</h2>
          <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
            <Badge className={`${style.bg} ${style.text}`}>{style.label}</Badge>
            {business && (
              <span className="text-[var(--color-ink-faint)]">{business.name}</span>
            )}
            {mission.is_demo && <DemoNotice />}
          </p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Close inspector"
            className="rounded-lg p-1 text-[var(--color-ink-faint)] hover:bg-white/[0.06] hover:text-[var(--color-ink)]"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </header>

      <div className="scroll-thin flex-1 overflow-y-auto p-4">
        <p className="text-[13px] leading-relaxed text-[var(--color-ink-muted)]">
          {mission.objective}
        </p>

        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between text-[11px] text-[var(--color-ink-faint)]">
            <span>Progress</span>
            <span>{mission.progress}%</span>
          </div>
          <ProgressBar value={mission.progress} label="Mission progress" />
        </div>

        <ol className="mt-5 space-y-1.5">
          {tasks.map((task, index) => {
            const agent = snapshot?.agents.find((a) => a.id === task.agent_id);
            const taskStyle = TASK_STATUS_STYLES[task.status];
            return (
              <li key={task.id}>
                <button
                  onClick={() => agent && select({ type: 'agent', id: agent.id })}
                  className="flex w-full items-start gap-3 rounded-lg border border-[var(--color-edge)] bg-white/[0.02] p-2.5 text-left transition-colors hover:bg-white/[0.05]"
                >
                  <span className="mt-0.5 font-mono text-[11px] text-[var(--color-ink-faint)]">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px]">{task.title}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--color-ink-faint)]">
                      {agent && (
                        <span className="flex items-center gap-1">
                          <span
                            className="h-1.5 w-1.5 rounded-full"
                            style={{ backgroundColor: agent.visual.colour }}
                          />
                          {agent.name}
                        </span>
                      )}
                      <span className={taskStyle.text}>{taskStyle.label}</span>
                    </span>
                    <span className="mt-0.5 block text-[10.5px] leading-snug text-[var(--color-ink-faint)]">
                      {describeTaskLifecycle(task)}
                    </span>
                    {task.error && (
                      <span className="mt-1 block text-[11px] leading-snug text-amber-300">
                        {task.error}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>

        {error && (
          <p className="mt-4 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-200">
            {error}
          </p>
        )}
      </div>

      {(advanceable || retryable) && (
        <div className="space-y-2 border-t border-[var(--color-edge-soft)] p-3">
          {retryable && (
            <>
              <Button variant="primary" className="w-full" loading={running} onClick={retry}>
                <RotateCw className="h-3.5 w-3.5" />
                Retry failed steps
              </Button>
              <p className="text-[11px] leading-relaxed text-[var(--color-ink-faint)]">
                Runs the steps that failed and the ones cancelled behind them. Work that already
                completed is kept — nothing is regenerated and nothing is charged twice.
              </p>
            </>
          )}
          {advanceable && (
            <Button
              variant={retryable ? 'secondary' : 'primary'}
              className="w-full"
              loading={running}
              onClick={advance}
            >
              <Play className="h-3.5 w-3.5" />
              Advance mission
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
