import type { AgentStatus, MissionStatus, Task, TaskStatus } from '@/types/domain';
import { formatDuration, formatRelativeTime } from '@/lib/utils';

export interface StatusStyle {
  label: string;
  /** Hex, so it can drive both DOM styles and WebGL materials. */
  colour: string;
  /** Tailwind classes for the DOM side. */
  text: string;
  bg: string;
  /** Emissive multiplier applied to the planet material. */
  glow: number;
  /** Draws the slow amber attention ring. */
  ring?: boolean;
  /** Renders the planet dimmed — offline or disabled. */
  dim?: boolean;
}

export const AGENT_STATUS_STYLES: Record<AgentStatus, StatusStyle> = {
  idle: {
    label: 'Idle',
    colour: '#34d399',
    text: 'text-emerald-300',
    bg: 'bg-emerald-400/10',
    glow: 0.55,
  },
  working: {
    label: 'Working',
    colour: '#38bdf8',
    text: 'text-sky-300',
    bg: 'bg-sky-400/10',
    glow: 1.35,
  },
  waiting: {
    label: 'Waiting',
    colour: '#fbbf24',
    text: 'text-amber-300',
    bg: 'bg-amber-400/10',
    glow: 0.8,
  },
  needs_approval: {
    label: 'Needs approval',
    colour: '#f59e0b',
    text: 'text-amber-300',
    bg: 'bg-amber-400/10',
    glow: 0.95,
    ring: true,
  },
  error: {
    label: 'Error',
    colour: '#f87171',
    text: 'text-red-300',
    bg: 'bg-red-400/10',
    glow: 1.1,
  },
  offline: {
    label: 'Offline',
    colour: '#64748b',
    text: 'text-slate-400',
    bg: 'bg-slate-400/10',
    glow: 0.12,
    dim: true,
  },
  disabled: {
    label: 'Disabled',
    colour: '#475569',
    text: 'text-slate-500',
    bg: 'bg-slate-500/10',
    glow: 0.08,
    dim: true,
  },
};

export const TASK_STATUS_STYLES: Record<TaskStatus, { label: string; text: string; bg: string }> = {
  queued: { label: 'Queued', text: 'text-slate-300', bg: 'bg-slate-400/10' },
  running: { label: 'Running', text: 'text-sky-300', bg: 'bg-sky-400/10' },
  waiting: { label: 'Waiting', text: 'text-amber-300', bg: 'bg-amber-400/10' },
  approval: { label: 'Awaiting approval', text: 'text-amber-300', bg: 'bg-amber-400/10' },
  completed: { label: 'Completed', text: 'text-emerald-300', bg: 'bg-emerald-400/10' },
  failed: { label: 'Failed', text: 'text-red-300', bg: 'bg-red-400/10' },
  cancelled: { label: 'Cancelled', text: 'text-slate-400', bg: 'bg-slate-500/10' },
};

export const MISSION_STATUS_STYLES: Record<
  MissionStatus,
  { label: string; text: string; bg: string }
> = {
  planning: { label: 'Planning', text: 'text-slate-300', bg: 'bg-slate-400/10' },
  running: { label: 'Running', text: 'text-sky-300', bg: 'bg-sky-400/10' },
  waiting: { label: 'Waiting', text: 'text-amber-300', bg: 'bg-amber-400/10' },
  needs_approval: { label: 'Needs approval', text: 'text-amber-300', bg: 'bg-amber-400/10' },
  completed: { label: 'Completed', text: 'text-emerald-300', bg: 'bg-emerald-400/10' },
  failed: { label: 'Failed', text: 'text-red-300', bg: 'bg-red-400/10' },
  cancelled: { label: 'Cancelled', text: 'text-slate-400', bg: 'bg-slate-500/10' },
};

export function agentStatusStyle(status: AgentStatus): StatusStyle {
  return AGENT_STATUS_STYLES[status];
}

/** How long a `running` task goes without a heartbeat before it reads as stale in the UI. */
const STALE_HINT_MS = 2 * 60 * 1000;

/**
 * One line covering a task's whole lifecycle — Created, Claimed, Started,
 * Completed/Failed — so the operator can see whether a task is genuinely
 * alive without opening a database table.
 *
 * `claimed_at` is when the runner picked the task up, distinct from
 * `started_at` (the handler actually beginning); a gap between the two, or a
 * `running` task whose heartbeat has gone quiet, is itself the signal that a
 * task some request was working on got orphaned by a crash or restart.
 */
export function describeTaskLifecycle(task: Task): string {
  const parts: string[] = [`Created ${formatRelativeTime(task.created_at)}`];

  if (task.status === 'queued' && !task.claimed_at) {
    parts.push('never picked up yet');
    if (task.reclaim_count > 0) {
      parts.push(
        `recovered from a stale run ${task.reclaim_count} time${task.reclaim_count === 1 ? '' : 's'}`,
      );
    }
    return parts.join(' — ');
  }

  if (task.claimed_at) parts.push(`claimed ${formatRelativeTime(task.claimed_at)}`);
  if (task.started_at) parts.push(`started ${formatRelativeTime(task.started_at)}`);

  if (task.status === 'running') {
    const lastSign = task.heartbeat_at ?? task.claimed_at ?? task.started_at;
    const age = lastSign ? Date.now() - new Date(lastSign).getTime() : null;
    if (age !== null && age > STALE_HINT_MS) {
      parts.push(`no activity for ${formatDuration(age)} — likely stale`);
    } else {
      parts.push('in progress');
    }
    return parts.join(' — ');
  }

  if (task.completed_at) {
    const label = task.status === 'failed' ? 'failed' : 'completed';
    const startedAt = task.started_at ?? task.claimed_at;
    const took = startedAt
      ? ` (took ${formatDuration(new Date(task.completed_at).getTime() - new Date(startedAt).getTime())})`
      : '';
    parts.push(`${label} ${formatRelativeTime(task.completed_at)}${took}`);
  }

  return parts.join(' — ');
}
