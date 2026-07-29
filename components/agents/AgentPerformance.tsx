'use client';

import { EMPTY, useWorkforce } from '@/lib/store/workforce';
import { agentWorkloads, WORKLOAD_THRESHOLDS, type WorkloadBand } from '@/lib/operations/today';
import { formatDuration, formatMoneyPrecise, formatRelativeTime } from '@/lib/utils';
import { Badge, Panel } from '@/components/ui';
import type { Agent } from '@/types/domain';

const BAND_TONE: Record<WorkloadBand, 'neutral' | 'emerald' | 'amber' | 'red'> = {
  idle: 'neutral',
  light: 'emerald',
  busy: 'amber',
  overloaded: 'red',
};

/**
 * How an agent is actually doing.
 *
 * Operational metrics only — completed, failed, duration, cost. Deliberately
 * *not* labelled as quality: a task completing means the pipeline ran, not that
 * the output was good. Whether a video performed belongs to channel analytics,
 * and mixing the two would let a busy agent look like an effective one.
 */
export function AgentPerformance({ agent }: { agent: Agent }) {
  const tasks = useWorkforce((s) => s.snapshot?.tasks) ?? EMPTY;
  const missions = useWorkforce((s) => s.snapshot?.missions) ?? EMPTY;

  // Costs are not in the snapshot; the agent row carries its running total.
  const workload = agentWorkloads([agent], tasks, [])[0]!;
  const mine = tasks.filter((task) => task.agent_id === agent.id);
  const total = agent.tasks_completed + agent.tasks_failed;
  const successRate = total > 0 ? Math.round((agent.tasks_completed / total) * 100) : null;
  const averageCost =
    agent.tasks_completed > 0 ? agent.estimated_total_cost / agent.tasks_completed : null;

  const recent = mine
    .filter((task) => task.status === 'completed' || task.status === 'failed')
    .sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''))
    .slice(0, 5);

  return (
    <div className="space-y-3">
      <Panel className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-auto text-[13px] font-semibold">Workload</h2>
          <Badge tone={BAND_TONE[workload.band]}>{workload.band}</Badge>
        </div>

        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2.5 sm:grid-cols-4">
          <Stat label="Current task" value={workload.currentTaskTitle ? '1' : '0'} />
          <Stat label="Queued" value={workload.queued} />
          <Stat label="Completed today" value={workload.completedToday} />
          <Stat
            label="Failed today"
            value={workload.failedToday}
            tone={workload.failedToday > 0 ? '#f87171' : undefined}
          />
        </dl>

        {workload.currentTaskTitle && (
          <p className="mt-2.5 text-[12px] text-[var(--color-ink-muted)]">
            <span className="text-[var(--color-ink-faint)]">Working on: </span>
            {workload.currentTaskTitle}
          </p>
        )}

        <p className="mt-2.5 text-[11px] leading-relaxed text-[var(--color-ink-faint)]">
          Counted from tasks, not estimated. Idle is nothing live; light is one; busy is{' '}
          {WORKLOAD_THRESHOLDS.busy}–{WORKLOAD_THRESHOLDS.overloaded - 1}; overloaded is{' '}
          {WORKLOAD_THRESHOLDS.overloaded} or more.
        </p>
      </Panel>

      <Panel className="p-4">
        <h2 className="text-[13px] font-semibold">Performance</h2>
        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2.5 sm:grid-cols-3">
          <Stat label="Tasks completed" value={agent.tasks_completed} />
          <Stat
            label="Tasks failed"
            value={agent.tasks_failed}
            tone={agent.tasks_failed > 0 ? '#f87171' : undefined}
          />
          {/* Null until there is anything to divide — a brand-new agent has no
              success rate, not a 0% one. */}
          <Stat label="Success rate" value={successRate === null ? null : `${successRate}%`} />
          <Stat
            label="Average run"
            value={
              agent.average_execution_time > 0
                ? formatDuration(agent.average_execution_time)
                : null
            }
          />
          <Stat
            label="Cost to date"
            value={formatMoneyPrecise(agent.estimated_total_cost)}
          />
          <Stat
            label="Average per task"
            value={averageCost === null ? null : formatMoneyPrecise(averageCost)}
          />
        </dl>
        <p className="mt-2.5 text-[11px] leading-relaxed text-[var(--color-ink-faint)]">
          These say whether the agent <em>ran</em>, not whether its output was good. How a video
          performed lives in channel analytics — an agent that completes quickly is not thereby a
          better agent.
        </p>
      </Panel>

      {recent.length > 0 && (
        <Panel className="overflow-hidden">
          <p className="border-b border-[var(--color-edge-soft)] px-3.5 py-2 text-[10px] uppercase tracking-[0.12em] text-[var(--color-ink-faint)]">
            Recent output
          </p>
          <ul className="divide-y divide-[var(--color-edge-soft)]">
            {recent.map((task) => {
              const mission = missions.find((m) => m.id === task.mission_id);
              return (
                <li key={task.id} className="px-3.5 py-2.5">
                  <p className="flex flex-wrap items-center gap-1.5 text-[12.5px]">
                    <span className="min-w-0 flex-1 truncate">{task.title}</span>
                    <Badge tone={task.status === 'failed' ? 'red' : 'emerald'}>{task.status}</Badge>
                  </p>
                  <p className="mt-0.5 text-[11px] text-[var(--color-ink-faint)]">
                    {mission ? `#${String(mission.number).padStart(3, '0')} · ` : ''}
                    {formatRelativeTime(task.completed_at ?? task.created_at)}
                  </p>
                  {task.error && (
                    <p className="mt-0.5 text-[11px] leading-snug text-red-300">{task.error}</p>
                  )}
                </li>
              );
            })}
          </ul>
        </Panel>
      )}
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
      <dt className="text-[10px] uppercase tracking-[0.1em] text-[var(--color-ink-faint)]">
        {label}
      </dt>
      <dd
        className="mt-0.5 text-[14px] font-semibold tabular-nums"
        style={tone ? { color: tone } : undefined}
      >
        {value === null ? <span className="text-[var(--color-ink-faint)]">—</span> : value}
      </dd>
    </div>
  );
}
