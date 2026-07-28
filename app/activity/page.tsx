'use client';

import { useState } from 'react';
import { EMPTY, useWorkforce } from '@/lib/store/workforce';
import { formatClock, formatRelativeTime } from '@/lib/utils';
import { DemoNotice, EmptyState, Panel } from '@/components/ui';
import { PageShell } from '@/components/layout/PageShell';
import type { ActivityKind } from '@/types/domain';

const KIND_LABELS: Record<ActivityKind, string> = {
  agent_started: 'Started',
  agent_completed: 'Completed',
  agent_failed: 'Failed',
  handoff: 'Handoff',
  mission_created: 'Mission created',
  mission_completed: 'Mission completed',
  approval_requested: 'Approval requested',
  approval_resolved: 'Approval resolved',
  system: 'System',
};

const KIND_COLOUR: Record<ActivityKind, string> = {
  agent_started: '#38bdf8',
  agent_completed: '#34d399',
  agent_failed: '#f87171',
  handoff: '#a855f7',
  mission_created: '#f5a524',
  mission_completed: '#34d399',
  approval_requested: '#f59e0b',
  approval_resolved: '#34d399',
  system: '#64748b',
};

export default function ActivityPage() {
  const activity = useWorkforce((s) => s.snapshot?.activity) ?? EMPTY;
  const agents = useWorkforce((s) => s.snapshot?.agents) ?? EMPTY;
  const select = useWorkforce((s) => s.select);
  const [kind, setKind] = useState<ActivityKind | 'all'>('all');

  const visible = kind === 'all' ? activity : activity.filter((a) => a.kind === kind);
  const kinds = [...new Set(activity.map((a) => a.kind))];

  return (
    <PageShell
      title="Activity"
      description="Everything the workforce has done, newest first. This is the raw activity log the live feed and the galaxy's handoff beams are drawn from."
    >
      <div className="mb-3 flex flex-wrap gap-1.5">
        <Chip active={kind === 'all'} onClick={() => setKind('all')}>
          All ({activity.length})
        </Chip>
        {kinds.map((k) => (
          <Chip key={k} active={kind === k} onClick={() => setKind(k)}>
            {KIND_LABELS[k]} ({activity.filter((a) => a.kind === k).length})
          </Chip>
        ))}
      </div>

      <Panel className="overflow-hidden">
        {visible.length === 0 ? (
          <EmptyState title="Nothing recorded yet" />
        ) : (
          <ul>
            {visible.map((entry) => {
              const agent = agents.find((a) => a.id === entry.agent_id);
              const target = agents.find((a) => a.id === entry.target_agent_id);
              return (
                <li key={entry.id} className="border-b border-[var(--color-edge-soft)] last:border-0">
                  <button
                    onClick={() => agent && select({ type: 'agent', id: agent.id })}
                    className="flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors hover:bg-white/[0.03]"
                  >
                    <span className="w-[46px] shrink-0 pt-0.5 font-mono text-[11px] text-[var(--color-ink-faint)]">
                      {formatClock(entry.created_at)}
                    </span>
                    <span
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: KIND_COLOUR[entry.kind] }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] leading-snug">{entry.message}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--color-ink-faint)]">
                        <span>{KIND_LABELS[entry.kind]}</span>
                        {agent && <span>· {agent.name}</span>}
                        {target && <span>→ {target.name}</span>}
                        <span>· {formatRelativeTime(entry.created_at)}</span>
                        {entry.is_demo && <DemoNotice />}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </PageShell>
  );
}

function Chip({
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
