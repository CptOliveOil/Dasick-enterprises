'use client';

import { ChevronDown, ChevronUp } from 'lucide-react';
import { EMPTY, useWorkforce } from '@/lib/store/workforce';
import { formatClock, formatRelativeTime } from '@/lib/utils';
import { DemoNotice } from '@/components/ui';
import type { ActivityKind } from '@/types/domain';

const KIND_COLOUR: Record<ActivityKind, string> = {
  agent_started: '#38bdf8',
  agent_completed: '#34d399',
  agent_failed: '#f87171',
  handoff: '#a855f7',
  mission_created: '#f5a524',
  mission_completed: '#34d399',
  approval_requested: '#f59e0b',
  approval_resolved: '#34d399',
  blocked: '#f59e0b',
  job_started: '#38bdf8',
  job_progress: '#38bdf8',
  job_completed: '#34d399',
  job_failed: '#f87171',
  asset_created: '#a855f7',
  operator_action: '#e8ebf5',
  system: '#64748b',
};

/** Collapsible live feed. Reads straight from activity_logs — nothing synthetic. */
export function ActivityStream() {
  const activity = useWorkforce((s) => s.snapshot?.activity) ?? EMPTY;
  const agents = useWorkforce((s) => s.snapshot?.agents) ?? EMPTY;
  const open = useWorkforce((s) => s.activityOpen);
  const toggle = useWorkforce((s) => s.toggleActivity);
  const select = useWorkforce((s) => s.select);

  const recent = activity.slice(0, 24);

  return (
    <section
      aria-label="Live activity"
      className="panel-flush shrink-0 rounded-none border-x-0 border-b-0 pb-14 md:pb-0"
    >
      <button
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 px-4 py-2 text-left"
      >
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-ink-muted)]">
          Live activity
        </span>
        <span className="flex items-center gap-1.5 text-[11px] text-emerald-400">
          <span className="h-1.5 w-1.5 animate-breathe rounded-full bg-emerald-400" />
          Live
        </span>
        <span className="ml-auto text-[var(--color-ink-faint)]">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </span>
      </button>

      {open && (
        <div className="scroll-thin flex gap-2 overflow-x-auto px-4 pb-3">
          {recent.length === 0 && (
            <p className="py-4 text-[13px] text-[var(--color-ink-faint)]">
              Nothing has happened yet. Give the workforce an instruction.
            </p>
          )}
          {recent.map((entry) => {
            const agent = agents.find((a) => a.id === entry.agent_id);
            return (
              <button
                key={entry.id}
                onClick={() => agent && select({ type: 'agent', id: agent.id })}
                className="w-[228px] shrink-0 rounded-xl border border-[var(--color-edge)] bg-white/[0.025] p-2.5 text-left transition-colors hover:bg-white/[0.05]"
              >
                <p className="flex items-center gap-1.5 text-[11px] font-medium">
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: KIND_COLOUR[entry.kind] }}
                  />
                  <span className="truncate">{agent?.name ?? 'Command Centre'}</span>
                  {entry.is_demo && <DemoNotice className="ml-auto" />}
                </p>
                <p className="mt-1 line-clamp-2 text-[12px] leading-snug text-[var(--color-ink-muted)]">
                  {entry.message}
                </p>
                <p className="mt-1.5 text-[10px] text-[var(--color-ink-faint)]">
                  {formatClock(entry.created_at)} · {formatRelativeTime(entry.created_at)}
                </p>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
