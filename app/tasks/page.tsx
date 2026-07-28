'use client';

import { useState } from 'react';
import { LayoutGrid, List } from 'lucide-react';
import { EMPTY, useWorkforce } from '@/lib/store/workforce';
import { TASK_STATUS_STYLES } from '@/lib/agents/status';
import { formatRelativeTime, missionLabel } from '@/lib/utils';
import { Badge, Button, DemoNotice, ProgressBar } from '@/components/ui';
import { DataTable, PageShell } from '@/components/layout/PageShell';
import { TASK_STATUSES, type Task, type TaskStatus } from '@/types/domain';

const BOARD_COLUMNS: TaskStatus[] = [
  'queued',
  'running',
  'waiting',
  'approval',
  'completed',
  'failed',
];

/** Tasks as a board or a list — the productivity view the galaxy cannot replace. */
export default function TasksPage() {
  const tasks = useWorkforce((s) => s.snapshot?.tasks) ?? EMPTY;
  const agents = useWorkforce((s) => s.snapshot?.agents) ?? EMPTY;
  const missions = useWorkforce((s) => s.snapshot?.missions) ?? EMPTY;
  const select = useWorkforce((s) => s.select);
  const [view, setView] = useState<'board' | 'list'>('board');
  const [filter, setFilter] = useState<TaskStatus | 'all'>('all');

  const agentName = (id: string | null) => agents.find((a) => a.id === id)?.name ?? 'Unassigned';
  const missionOf = (id: string | null) => missions.find((m) => m.id === id) ?? null;
  const visible = filter === 'all' ? tasks : tasks.filter((t) => t.status === filter);

  return (
    <PageShell
      title="Tasks"
      description="Every unit of work assigned to an agent, including the ones the workflow engine created."
      wide
      actions={
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={view === 'board' ? 'primary' : 'secondary'}
            onClick={() => setView('board')}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            Board
          </Button>
          <Button
            size="sm"
            variant={view === 'list' ? 'primary' : 'secondary'}
            onClick={() => setView('list')}
          >
            <List className="h-3.5 w-3.5" />
            List
          </Button>
        </div>
      }
    >
      {view === 'list' && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>
            All ({tasks.length})
          </FilterChip>
          {TASK_STATUSES.map((status) => {
            const count = tasks.filter((t) => t.status === status).length;
            if (count === 0) return null;
            return (
              <FilterChip
                key={status}
                active={filter === status}
                onClick={() => setFilter(status)}
              >
                {TASK_STATUS_STYLES[status].label} ({count})
              </FilterChip>
            );
          })}
        </div>
      )}

      {view === 'board' ? (
        <div className="scroll-thin flex gap-3 overflow-x-auto pb-2">
          {BOARD_COLUMNS.map((status) => {
            const column = tasks.filter((t) => t.status === status);
            const style = TASK_STATUS_STYLES[status];
            return (
              <div key={status} className="w-[268px] shrink-0">
                <p className="mb-2 flex items-center justify-between px-1 text-[11px] font-semibold uppercase tracking-[0.12em]">
                  <span className={style.text}>{style.label}</span>
                  <span className="text-[var(--color-ink-faint)]">{column.length}</span>
                </p>
                <div className="space-y-2">
                  {column.length === 0 && (
                    <p className="rounded-xl border border-dashed border-[var(--color-edge)] px-3 py-6 text-center text-[12px] text-[var(--color-ink-faint)]">
                      Empty
                    </p>
                  )}
                  {column.map((task) => {
                    const mission = missionOf(task.mission_id);
                    return (
                      <button
                        key={task.id}
                        onClick={() =>
                          task.agent_id && select({ type: 'agent', id: task.agent_id })
                        }
                        className="w-full rounded-xl border border-[var(--color-edge)] bg-white/[0.025] p-3 text-left transition-colors hover:bg-white/[0.05]"
                      >
                        <p className="text-[13px] leading-snug">{task.title}</p>
                        <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--color-ink-faint)]">
                          <span>{agentName(task.agent_id)}</span>
                          {mission && <span>· {missionLabel(mission.number)}</span>}
                          {task.is_demo && <DemoNotice />}
                        </p>
                        {task.status === 'running' && (
                          <ProgressBar className="mt-2" value={task.progress} label="Task progress" />
                        )}
                        {task.error && (
                          <p className="mt-1.5 text-[11px] leading-snug text-amber-300">
                            {task.error}
                          </p>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <DataTable<Task>
          rows={visible}
          rowKey={(task) => task.id}
          empty="No tasks match this filter."
          onRowClick={(task) => task.agent_id && select({ type: 'agent', id: task.agent_id })}
          columns={[
            { key: 'title', header: 'Task', render: (task) => task.title },
            {
              key: 'agent',
              header: 'Agent',
              render: (task) => (
                <span className="text-[var(--color-ink-muted)]">{agentName(task.agent_id)}</span>
              ),
            },
            {
              key: 'mission',
              header: 'Mission',
              render: (task) => {
                const mission = missionOf(task.mission_id);
                return (
                  <span className="font-mono text-[11px] text-amber-400">
                    {mission ? missionLabel(mission.number) : '—'}
                  </span>
                );
              },
            },
            {
              key: 'status',
              header: 'Status',
              render: (task) => {
                const style = TASK_STATUS_STYLES[task.status];
                return <Badge className={`${style.bg} ${style.text}`}>{style.label}</Badge>;
              },
            },
            {
              key: 'priority',
              header: 'Priority',
              render: (task) => (
                <span className="text-[var(--color-ink-muted)] capitalize">{task.priority}</span>
              ),
            },
            {
              key: 'created',
              header: 'Created',
              render: (task) => (
                <span className="text-[var(--color-ink-faint)]">
                  {formatRelativeTime(task.created_at)}
                </span>
              ),
            },
          ]}
        />
      )}
    </PageShell>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full px-2.5 py-1 text-[12px] transition-colors ${
        active
          ? 'bg-white/[0.1] text-[var(--color-ink)]'
          : 'bg-white/[0.04] text-[var(--color-ink-muted)] hover:bg-white/[0.07]'
      }`}
    >
      {children}
    </button>
  );
}
