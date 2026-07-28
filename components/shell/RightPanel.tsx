'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { useWorkforce } from '@/lib/store/workforce';
import { MISSION_STATUS_STYLES } from '@/lib/agents/status';
import { formatMoney, formatRelativeTime, missionLabel } from '@/lib/utils';
import { Metric, Panel, PanelHeader, ProgressBar } from '@/components/ui';
import { AgentInspector } from '@/components/agents/AgentInspector';
import { MissionInspector } from '@/components/missions/MissionInspector';
import { ApprovalCard } from '@/components/approvals/ApprovalCard';

/**
 * The contextual panel. Default is the workforce overview; selecting a planet
 * or a mission replaces it with the matching inspector.
 */
export function RightPanel() {
  const selection = useWorkforce((s) => s.selection);
  const select = useWorkforce((s) => s.select);
  const snapshot = useWorkforce((s) => s.snapshot);

  const agent =
    selection?.type === 'agent'
      ? (snapshot?.agents.find((a) => a.id === selection.id) ?? null)
      : null;
  const mission =
    selection?.type === 'mission'
      ? (snapshot?.missions.find((m) => m.id === selection.id) ?? null)
      : null;

  return (
    <aside
      aria-label="Details"
      className="hidden w-[344px] shrink-0 flex-col border-l border-[var(--color-edge)] bg-[var(--color-deep)]/60 lg:flex"
    >
      {agent ? (
        <AgentInspector agent={agent} onClose={() => select(null)} />
      ) : mission ? (
        <MissionInspector mission={mission} onClose={() => select(null)} />
      ) : (
        <WorkforceOverview />
      )}
    </aside>
  );
}

export function WorkforceOverview() {
  const snapshot = useWorkforce((s) => s.snapshot);
  const select = useWorkforce((s) => s.select);
  const metrics = snapshot?.metrics;

  const activeMissions = (snapshot?.missions ?? []).filter(
    (m) => !['completed', 'cancelled', 'failed'].includes(m.status),
  );
  const pending = (snapshot?.approvals ?? []).filter((a) => a.status === 'pending');

  return (
    <div className="scroll-thin flex-1 space-y-3 overflow-y-auto p-3">
      <Panel>
        <PanelHeader title="Workforce overview" />
        <div className="grid grid-cols-2 gap-4 p-4">
          <Metric value={metrics?.agentsActive ?? '—'} label="Active agents" />
          <Metric value={metrics?.tasksRunning ?? '—'} label="Running tasks" />
          <Metric
            value={metrics?.awaitingApproval ?? '—'}
            label="Awaiting approval"
            tone={metrics?.awaitingApproval ? '#fbbf24' : undefined}
          />
          <Metric value={metrics?.completedToday ?? '—'} label="Completed today" />
        </div>
      </Panel>

      <Panel>
        <PanelHeader
          title="This month"
          action={
            <Link
              href="/finance"
              className="text-[11px] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
            >
              Finance →
            </Link>
          }
        />
        <div className="grid grid-cols-3 gap-3 p-4">
          <Metric
            value={metrics ? formatMoney(metrics.revenue, metrics.currency) : '—'}
            label="Revenue"
            tone="#34d399"
          />
          <Metric
            value={metrics ? formatMoney(metrics.aiCosts + metrics.expenses, metrics.currency) : '—'}
            label="Costs"
            tone="#f87171"
          />
          <Metric
            value={metrics ? formatMoney(metrics.profit, metrics.currency) : '—'}
            label="Profit"
          />
        </div>
      </Panel>

      <Panel>
        <PanelHeader
          title="Active missions"
          action={
            <Link
              href="/missions"
              className="text-[11px] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
            >
              All →
            </Link>
          }
        />
        <div className="space-y-1 p-2">
          {activeMissions.length === 0 && (
            <p className="px-2 py-4 text-center text-[12px] text-[var(--color-ink-faint)]">
              No missions running.
            </p>
          )}
          {activeMissions.slice(0, 5).map((mission) => {
            const style = MISSION_STATUS_STYLES[mission.status];
            return (
              <button
                key={mission.id}
                onClick={() => select({ type: 'mission', id: mission.id })}
                className="w-full rounded-lg px-2 py-2 text-left transition-colors hover:bg-white/[0.05]"
              >
                <p className="flex items-baseline gap-2">
                  <span className="font-mono text-[10px] text-amber-400">
                    {missionLabel(mission.number)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px]">{mission.title}</span>
                  <span className="text-[11px] text-[var(--color-ink-faint)]">
                    {mission.progress}%
                  </span>
                </p>
                <p className={`mt-1 text-[11px] ${style.text}`}>{style.label}</p>
                <ProgressBar className="mt-1.5" value={mission.progress} label="Mission progress" />
              </button>
            );
          })}
        </div>
      </Panel>

      <Panel>
        <PanelHeader
          title={`Approvals${pending.length ? ` · ${pending.length}` : ''}`}
          action={
            <Link
              href="/approvals"
              className="flex items-center gap-1 text-[11px] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
            >
              All <ArrowRight className="h-3 w-3" />
            </Link>
          }
        />
        <div className="space-y-2 p-2">
          {pending.length === 0 && (
            <p className="px-2 py-4 text-center text-[12px] text-[var(--color-ink-faint)]">
              Nothing waiting on you.
            </p>
          )}
          {pending.slice(0, 3).map((approval) => (
            <ApprovalCard key={approval.id} approval={approval} compact />
          ))}
        </div>
      </Panel>

      <Panel>
        <PanelHeader title="Recent activity" />
        <ul className="space-y-2 p-3">
          {(snapshot?.activity ?? []).slice(0, 6).map((entry) => (
            <li key={entry.id} className="flex gap-2.5 text-[12px]">
              <span className="w-[52px] shrink-0 text-[11px] text-[var(--color-ink-faint)]">
                {formatRelativeTime(entry.created_at)}
              </span>
              <span className="min-w-0 flex-1 leading-snug text-[var(--color-ink-muted)]">
                {entry.message}
              </span>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
