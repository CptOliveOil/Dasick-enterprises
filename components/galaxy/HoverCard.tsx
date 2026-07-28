'use client';

import { formatDuration } from '@/lib/utils';
import { agentStatusStyle } from '@/lib/agents/status';
import type { Agent, Task } from '@/types/domain';
import { StatusDot } from '@/components/ui';

/**
 * Compact holographic readout shown while a planet is hovered. Deliberately
 * small — the galaxy must not disappear behind labels.
 */
export function HoverCard({
  agent,
  task,
  business,
  x,
  y,
}: {
  agent: Agent;
  task: Task | null;
  business: string | null;
  x: number;
  y: number;
}) {
  const style = agentStatusStyle(agent.status);
  const runningFor =
    task?.started_at && task.status === 'running'
      ? formatDuration(Date.now() - new Date(task.started_at).getTime())
      : null;

  return (
    <div
      className="animate-slide-up pointer-events-none absolute z-30 w-[248px]"
      style={{
        left: Math.min(x + 18, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 280),
        top: Math.max(12, y - 20),
      }}
      role="tooltip"
    >
      <div
        className="rounded-xl border bg-[#080d1a]/92 p-3 shadow-2xl backdrop-blur-xl"
        style={{ borderColor: `${style.colour}44` }}
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-ink)]">
          {agent.name}
        </p>
        <p className="mt-1 flex items-center gap-1.5 text-[11px]">
          <StatusDot colour={style.colour} pulse={agent.status === 'needs_approval'} />
          <span className={style.text}>{style.label}</span>
          {business && (
            <span className="text-[var(--color-ink-faint)]">· {business}</span>
          )}
        </p>

        {task ? (
          <div className="mt-2.5 space-y-1 border-t border-white/5 pt-2.5">
            <p className="text-[10px] uppercase tracking-[0.1em] text-[var(--color-ink-faint)]">
              Current task
            </p>
            <p className="text-[12px] leading-snug text-[var(--color-ink)]">{task.title}</p>
            {task.progress > 0 && task.status === 'running' && (
              <p className="text-[11px] text-[var(--color-ink-muted)]">
                Progress: {task.progress}%
              </p>
            )}
            {runningFor && (
              <p className="text-[11px] text-[var(--color-ink-muted)]">
                Running for {runningFor}
              </p>
            )}
          </div>
        ) : (
          <p className="mt-2.5 border-t border-white/5 pt-2.5 text-[12px] text-[var(--color-ink-muted)]">
            {agent.role}
          </p>
        )}

        <p className="mt-2.5 text-[11px] text-[var(--color-ink-faint)]">Click to inspect →</p>
      </div>
    </div>
  );
}
