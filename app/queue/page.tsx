'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { EMPTY, useWorkforce } from '@/lib/store/workforce';
import { formatDuration, formatRelativeTime } from '@/lib/utils';
import { Badge, EmptyState, Panel, StatusDot } from '@/components/ui';
import { PageShell, Tabs } from '@/components/layout/PageShell';
import { MISSION_PRIORITY_LABELS, type Task, type TaskStatus } from '@/types/domain';

const TABS = [
  { key: 'now', label: 'Now' },
  { key: 'next', label: 'Next' },
  { key: 'waiting', label: 'Waiting' },
  { key: 'approval', label: 'Needs approval' },
  { key: 'blocked', label: 'Blocked' },
  { key: 'done', label: 'Done' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

/**
 * Every task, across every business, in one conventional list.
 *
 * The galaxy answers "what is my workforce doing"; this answers "what is in the
 * queue and in what order". Same data, different question — nothing here is a
 * separate source of truth.
 */
export default function QueuePage() {
  const tasks = useWorkforce((s) => s.snapshot?.tasks) ?? EMPTY;
  const agents = useWorkforce((s) => s.snapshot?.agents) ?? EMPTY;
  const missions = useWorkforce((s) => s.snapshot?.missions) ?? EMPTY;
  const businesses = useWorkforce((s) => s.snapshot?.businesses) ?? EMPTY;
  const approvals = useWorkforce((s) => s.snapshot?.approvals) ?? EMPTY;
  const filter = useWorkforce((s) => s.businessFilter);

  const [tab, setTab] = useState<TabKey>('now');

  const scoped = useMemo(
    () => (filter ? tasks.filter((task) => task.business_id === filter) : tasks),
    [tasks, filter],
  );

  const awaitingIds = useMemo(
    () =>
      new Set(
        approvals
          .filter((approval) => approval.status === 'pending' && approval.task_id)
          .map((approval) => approval.task_id!),
      ),
    [approvals],
  );

  const buckets = useMemo(() => {
    const inBucket = (task: Task): TabKey => {
      if (awaitingIds.has(task.id)) return 'approval';
      if (task.status === 'running') return 'now';
      if (task.status === 'failed' || task.status === 'cancelled') return 'blocked';
      if (task.status === 'completed') return 'done';
      if (task.status === 'queued') return 'next';
      return 'waiting';
    };
    const grouped: Record<TabKey, Task[]> = {
      now: [],
      next: [],
      waiting: [],
      approval: [],
      blocked: [],
      done: [],
    };
    for (const task of scoped) grouped[inBucket(task)].push(task);
    // Done is newest-first; everything else oldest-first, because the oldest
    // queued item is the one most likely to be holding something up.
    grouped.done.sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''));
    for (const key of ['now', 'next', 'waiting', 'approval', 'blocked'] as const) {
      grouped[key].sort((a, b) => a.created_at.localeCompare(b.created_at));
    }
    return grouped;
  }, [scoped, awaitingIds]);

  const rows = buckets[tab];
  const nameOf = (list: readonly { id: string; name: string }[], id: string | null) =>
    id ? (list.find((item) => item.id === id)?.name ?? '—') : '—';

  return (
    <PageShell
      title="Work queue"
      description="Every task across every business, in the order it will happen. The same state the galaxy shows, as a list."
      wide
    >
      <Tabs
        tabs={TABS.map((entry) => ({
          href: `#${entry.key}`,
          label: `${entry.label}${buckets[entry.key].length > 0 ? ` (${buckets[entry.key].length})` : ''}`,
        }))}
        onSelect={(href) => setTab(href.slice(1) as TabKey)}
        active={`#${tab}`}
      />

      {rows.length === 0 ? (
        <Panel>
          <EmptyState
            title={`Nothing ${TABS.find((entry) => entry.key === tab)!.label.toLowerCase()}`}
            detail="This bucket is empty right now."
          />
        </Panel>
      ) : (
        <Panel className="overflow-hidden">
          <div className="scroll-thin overflow-x-auto">
            <table className="w-full min-w-[900px] text-left">
              <thead>
                <tr className="border-b border-[var(--color-edge-soft)]">
                  {['Task', 'Agent', 'Mission', 'Business', 'Priority', 'Status', 'When'].map(
                    (header) => (
                      <th
                        key={header}
                        scope="col"
                        className="px-3.5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-ink-faint)]"
                      >
                        {header}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((task) => {
                  const mission = missions.find((m) => m.id === task.mission_id) ?? null;
                  const running = task.status === 'running' && task.started_at;
                  return (
                    <tr
                      key={task.id}
                      className="border-b border-[var(--color-edge-soft)] text-[13px] last:border-0 hover:bg-white/[0.03]"
                    >
                      <td className="px-3.5 py-2.5">
                        <span className="block">{task.title}</span>
                        {task.error && (
                          <span className="mt-0.5 block text-[11px] leading-snug text-red-300">
                            {task.error}
                          </span>
                        )}
                      </td>
                      <td className="px-3.5 py-2.5 text-[var(--color-ink-muted)]">
                        {nameOf(agents, task.agent_id)}
                      </td>
                      <td className="px-3.5 py-2.5">
                        {mission ? (
                          <Link
                            href={`/missions/${mission.id}`}
                            className="text-amber-400 underline-offset-4 hover:underline"
                          >
                            #{String(mission.number).padStart(3, '0')}
                          </Link>
                        ) : (
                          <span className="text-[var(--color-ink-faint)]">—</span>
                        )}
                      </td>
                      <td className="px-3.5 py-2.5 text-[var(--color-ink-muted)]">
                        {nameOf(businesses, task.business_id)}
                      </td>
                      <td className="px-3.5 py-2.5">
                        {mission && mission.priority !== 'normal' ? (
                          <Badge
                            tone={
                              mission.priority === 'critical'
                                ? 'red'
                                : mission.priority === 'high'
                                  ? 'amber'
                                  : 'neutral'
                            }
                          >
                            {MISSION_PRIORITY_LABELS[mission.priority]}
                          </Badge>
                        ) : (
                          <span className="text-[11px] text-[var(--color-ink-faint)]">Normal</span>
                        )}
                      </td>
                      <td className="px-3.5 py-2.5">
                        <span className="flex items-center gap-1.5">
                          <StatusDot
                            colour={taskColour(task.status)}
                            pulse={task.status === 'running'}
                          />
                          <span className="text-[12px] text-[var(--color-ink-muted)]">
                            {task.status}
                          </span>
                        </span>
                      </td>
                      <td className="px-3.5 py-2.5 text-[11px] text-[var(--color-ink-faint)]">
                        {running
                          ? `running ${formatDuration(Date.now() - new Date(task.started_at!).getTime())}`
                          : formatRelativeTime(task.completed_at ?? task.created_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </PageShell>
  );
}

function taskColour(status: TaskStatus): string {
  switch (status) {
    case 'running':
      return '#38bdf8';
    case 'failed':
      return '#f87171';
    case 'completed':
      return '#34d399';
    case 'queued':
      return '#fbbf24';
    default:
      return '#64748b';
  }
}
