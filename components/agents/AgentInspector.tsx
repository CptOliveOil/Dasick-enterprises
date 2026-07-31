'use client';

import Link from 'next/link';
import {
  Brain,
  ExternalLink,
  History,
  Pause,
  Play,
  Send,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useWorkforce } from '@/lib/store/workforce';
import { agentStatusStyle } from '@/lib/agents/status';
import { describeAuthority } from '@/lib/agents/authority';
import { successRate } from '@/lib/finance/calculations';
import {
  formatDuration,
  formatMoneyPrecise,
  formatRelativeTime,
  pluralise,
} from '@/lib/utils';
import {
  Badge,
  Button,
  DemoNotice,
  Field,
  inputClass,
  ProgressBar,
  StatusDot,
} from '@/components/ui';
import type { Agent } from '@/types/domain';

/**
 * Everything about one agent, in the contextual panel. Every control here does
 * something real — there are no decorative buttons.
 */
export function AgentInspector({ agent, onClose }: { agent: Agent; onClose?: () => void }) {
  const snapshot = useWorkforce((s) => s.snapshot);
  const refresh = useWorkforce((s) => s.refresh);
  const [tab, setTab] = useState<'overview' | 'memory' | 'history'>('overview');
  const [taskTitle, setTaskTitle] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const style = agentStatusStyle(agent.status);
  const business = snapshot?.businesses.find((b) => b.id === agent.business_id) ?? null;
  const tasks = (snapshot?.tasks ?? []).filter((t) => t.agent_id === agent.id);
  const currentTask =
    tasks.find((t) => t.id === agent.current_task_id) ??
    tasks.find((t) => t.status === 'running') ??
    null;
  const activity = (snapshot?.activity ?? []).filter((a) => a.agent_id === agent.id);
  const authority = describeAuthority(agent.authority_level);

  const patch = async (body: Record<string, unknown>, label: string) => {
    setPending(label);
    setError(null);
    try {
      const response = await fetch(`/api/agents/${agent.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? 'Update failed.');
      }
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed.');
    } finally {
      setPending(null);
    }
  };

  const giveTask = async () => {
    const title = taskTitle.trim();
    if (!title) return;
    setPending('task');
    setError(null);
    try {
      const response = await fetch(`/api/agents/${agent.id}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, input: { instructions: title } }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'The task could not be assigned.');
      if (data.result?.status === 'failed') setError(data.result.error);
      setTaskTitle('');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The task could not be assigned.');
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-start gap-3 border-b border-[var(--color-edge-soft)] p-4">
        <span
          className="mt-0.5 h-8 w-8 shrink-0 rounded-full"
          style={{
            background: `radial-gradient(circle at 32% 30%, ${agent.visual.atmosphere}, ${agent.visual.colour} 62%, #05070f)`,
            boxShadow: `0 0 18px ${style.colour}55`,
          }}
        />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[15px] font-semibold">{agent.name}</h2>
          <p className="truncate text-[12px] text-[var(--color-ink-muted)]">{agent.role}</p>
          <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
            <StatusDot colour={style.colour} pulse={agent.status === 'needs_approval'} />
            <span className={style.text}>{style.label}</span>
            {business && (
              <span className="text-[var(--color-ink-faint)]">· {business.name}</span>
            )}
            {agent.is_demo && <DemoNotice />}
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

      <nav className="flex shrink-0 gap-1 border-b border-[var(--color-edge-soft)] px-3 py-2">
        {(
          [
            ['overview', 'Overview', SlidersHorizontal],
            ['memory', 'Memory', Brain],
            ['history', 'History', History],
          ] as const
        ).map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            aria-current={tab === key}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] transition-colors ${
              tab === key
                ? 'bg-white/[0.08] text-[var(--color-ink)]'
                : 'text-[var(--color-ink-muted)] hover:bg-white/[0.04]'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </nav>

      <div className="scroll-thin flex-1 overflow-y-auto p-4">
        {tab === 'overview' && (
          <div className="space-y-4">
            {currentTask ? (
              <section className="rounded-xl border border-[var(--color-edge)] bg-white/[0.025] p-3">
                <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--color-ink-faint)]">
                  Current task
                </p>
                <p className="mt-1 text-[13px] leading-snug">{currentTask.title}</p>
                <ProgressBar
                  className="mt-2.5"
                  value={currentTask.progress}
                  colour={style.colour}
                  label="Task progress"
                />
                <p className="mt-1.5 text-[11px] text-[var(--color-ink-muted)]">
                  {currentTask.progress}%
                  {currentTask.started_at &&
                    ` · running for ${formatDuration(
                      Date.now() - new Date(currentTask.started_at).getTime(),
                    )}`}
                </p>
              </section>
            ) : (
              <p className="rounded-xl border border-[var(--color-edge)] bg-white/[0.02] p-3 text-[13px] text-[var(--color-ink-muted)]">
                No task running. {agent.description}
              </p>
            )}

            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-[var(--color-edge)] bg-[var(--color-edge)]">
              <Stat label="Tasks running" value={tasks.filter((t) => t.status === 'running').length} />
              <Stat label="Completed" value={agent.tasks_completed} />
              <Stat label="Success rate" value={`${successRate(agent)}%`} />
              <Stat label="Avg run" value={formatDuration(agent.average_execution_time)} />
              <Stat label="AI model" value={agent.model} small />
              <Stat
                label="Est. cost"
                value={formatMoneyPrecise(agent.estimated_total_cost)}
                small
              />
            </dl>

            <section>
              <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--color-ink-faint)]">
                Authority
              </p>
              <p className="mt-1 text-[13px]">
                Level {agent.authority_level} — {authority.name}
              </p>
              <p className="mt-0.5 text-[12px] leading-snug text-[var(--color-ink-muted)]">
                {authority.detail}
              </p>
            </section>

            <section>
              <Field label="Give task" hint="Runs immediately through the agent execution engine.">
                <div className="flex gap-2">
                  <input
                    value={taskTitle}
                    onChange={(event) => setTaskTitle(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') void giveTask();
                    }}
                    placeholder={`Tell ${agent.name} what to do…`}
                    className={inputClass}
                    disabled={agent.status === 'offline' || agent.status === 'disabled'}
                  />
                  <Button
                    variant="primary"
                    onClick={giveTask}
                    loading={pending === 'task'}
                    disabled={!taskTitle.trim() || agent.status === 'offline' || agent.status === 'disabled'}
                    aria-label="Assign task"
                  >
                    <Send className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </Field>
            </section>

            {error && (
              <p className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-[12px] text-red-300">
                {error}
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              {agent.status === 'disabled' || agent.status === 'offline' ? (
                <Button
                  variant="success"
                  size="sm"
                  loading={pending === 'enable'}
                  onClick={() => patch({ status: 'idle' }, 'enable')}
                >
                  <Play className="h-3.5 w-3.5" />
                  Enable agent
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  loading={pending === 'pause'}
                  onClick={() => patch({ status: 'disabled' }, 'pause')}
                >
                  <Pause className="h-3.5 w-3.5" />
                  Pause agent
                </Button>
              )}
              <Link href={`/agents/${agent.slug}`}>
                <Button variant="secondary" size="sm">
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open agent
                </Button>
              </Link>
            </div>
          </div>
        )}

        {tab === 'memory' && <AgentMemoryList agentId={agent.id} />}

        {tab === 'history' && (
          <div className="space-y-2">
            {/* Both, and only "nothing yet" when both are genuinely empty. The
                bare count this replaced could read "0 activity entries" beside
                real work, and "has not run a task yet" while three entries sat
                unshown — a history that reports a number nobody can check is
                worse than no history. */}
            {tasks.length === 0 && activity.length === 0 && (
              <p className="text-[13px] text-[var(--color-ink-faint)]">
                {agent.name} has not run anything yet.
              </p>
            )}
            {tasks.slice(0, 20).map((task) => (
              <div
                key={task.id}
                className="rounded-lg border border-[var(--color-edge)] bg-white/[0.02] p-2.5"
              >
                <p className="text-[12px] leading-snug">{task.title}</p>
                <p className="mt-1 flex items-center gap-2 text-[11px] text-[var(--color-ink-faint)]">
                  <Badge tone={task.status === 'failed' ? 'red' : 'neutral'}>{task.status}</Badge>
                  {formatRelativeTime(task.completed_at ?? task.created_at)}
                </p>
                {task.error && (
                  <p className="mt-1 text-[11px] leading-snug text-red-300">{task.error}</p>
                )}
              </div>
            ))}
            {activity.length > 0 && (
              <>
                <p className="pt-2 text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-faint)]">
                  {pluralise(activity.length, 'activity entry', 'activity entries')}
                </p>
                <ul className="space-y-1">
                  {activity.slice(0, 20).map((entry) => (
                    <li
                      key={entry.id}
                      className="rounded-lg border border-[var(--color-edge)] bg-white/[0.015] px-2.5 py-2"
                    >
                      <p className="text-[12px] leading-snug text-[var(--color-ink-muted)]">
                        {entry.message}
                      </p>
                      <p className="mt-0.5 text-[11px] text-[var(--color-ink-faint)]">
                        {entry.kind.replace(/_/g, ' ')} · {formatRelativeTime(entry.created_at)}
                      </p>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  small,
}: {
  label: string;
  value: React.ReactNode;
  small?: boolean;
}) {
  return (
    <div className="bg-[var(--color-panel)] px-3 py-2.5">
      <dt className="text-[10px] uppercase tracking-[0.1em] text-[var(--color-ink-faint)]">
        {label}
      </dt>
      <dd className={`mt-0.5 truncate ${small ? 'text-[12px]' : 'text-[15px] font-semibold'}`}>
        {value}
      </dd>
    </div>
  );
}

/** Agent memory is fetched on demand — it is not part of the live snapshot. */
function AgentMemoryList({ agentId }: { agentId: string }) {
  const [memory, setMemory] = useState<
    { id: string; type: string; content: string; importance: number }[] | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    setMemory(null);
    fetch(`/api/agents/${agentId}/memory`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setMemory(data.memory ?? []);
      })
      .catch(() => {
        if (!cancelled) setMemory([]);
      });
    return () => {
      cancelled = true;
    };
  }, [agentId]);

  if (memory === null) {
    return <p className="text-[13px] text-[var(--color-ink-faint)]">Loading memory…</p>;
  }

  if (memory.length === 0) {
    return (
      <p className="text-[13px] text-[var(--color-ink-muted)]">
        This agent has not learned anything yet. Memory is written as structured records, not
        raw conversation history.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {memory.map((item) => (
        <li
          key={item.id}
          className="rounded-lg border border-[var(--color-edge)] bg-white/[0.02] p-2.5"
        >
          <p className="text-[12px] leading-snug">{item.content}</p>
          <p className="mt-1.5 flex items-center gap-2 text-[10px] uppercase tracking-[0.1em] text-[var(--color-ink-faint)]">
            <span>{item.type}</span>
            <span>importance {item.importance}/5</span>
          </p>
        </li>
      ))}
    </ul>
  );
}
