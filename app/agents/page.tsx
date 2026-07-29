'use client';

import Link from 'next/link';
import { EMPTY, useWorkforce } from '@/lib/store/workforce';
import { agentStatusStyle } from '@/lib/agents/status';
import { describeAuthority } from '@/lib/agents/authority';
import { successRate } from '@/lib/finance/calculations';
import { formatDuration, formatMoneyPrecise, formatRelativeTime } from '@/lib/utils';
import { Button, DemoNotice, StatusDot } from '@/components/ui';
import { Plus } from 'lucide-react';
import { DataTable, PageShell } from '@/components/layout/PageShell';
import type { Agent } from '@/types/domain';

/** The conventional view of the workforce — everything the galaxy shows, as a table. */
export default function AgentsPage() {
  const agents = useWorkforce((s) => s.snapshot?.agents) ?? EMPTY;
  const businesses = useWorkforce((s) => s.snapshot?.businesses) ?? EMPTY;
  const tasks = useWorkforce((s) => s.snapshot?.tasks) ?? EMPTY;

  const businessName = (id: string | null) =>
    id ? (businesses.find((b) => b.id === id)?.name ?? '—') : 'Global';

  return (
    <PageShell
      title="Agents"
      description="Every agent in the workforce. The galaxy is the primary way to work with them, but everything here is equivalent and keyboard-accessible."
      wide
      actions={
        <Link href="/agents/new">
          <Button size="sm" variant="primary">
            <Plus className="h-3.5 w-3.5" />
            Create agent
          </Button>
        </Link>
      }
    >
      <DataTable<Agent>
        rows={agents}
        rowKey={(agent) => agent.id}
        empty="No agents yet."
        columns={[
          {
            key: 'name',
            header: 'Agent',
            render: (agent) => (
              <Link href={`/agents/${agent.slug}`} className="flex items-center gap-2.5">
                <span
                  className="h-6 w-6 shrink-0 rounded-full"
                  style={{
                    background: `radial-gradient(circle at 32% 30%, ${agent.visual.atmosphere}, ${agent.visual.colour} 62%, #05070f)`,
                  }}
                />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{agent.name}</span>
                  <span className="block truncate text-[11px] text-[var(--color-ink-faint)]">
                    {agent.role}
                  </span>
                </span>
                {agent.is_demo && <DemoNotice />}
              </Link>
            ),
          },
          {
            key: 'status',
            header: 'Status',
            render: (agent) => {
              const style = agentStatusStyle(agent.status);
              return (
                <span className="flex items-center gap-1.5">
                  <StatusDot colour={style.colour} pulse={agent.status === 'needs_approval'} />
                  <span className={style.text}>{style.label}</span>
                </span>
              );
            },
          },
          {
            key: 'business',
            header: 'Business',
            render: (agent) => (
              <span className="text-[var(--color-ink-muted)]">
                {businessName(agent.business_id)}
              </span>
            ),
          },
          {
            key: 'tasks',
            header: 'Active',
            render: (agent) =>
              tasks.filter(
                (t) => t.agent_id === agent.id && ['running', 'queued', 'approval'].includes(t.status),
              ).length,
          },
          { key: 'completed', header: 'Completed', render: (agent) => agent.tasks_completed },
          {
            key: 'success',
            header: 'Success',
            render: (agent) => `${successRate(agent)}%`,
          },
          {
            key: 'avg',
            header: 'Avg run',
            render: (agent) => (
              <span className="text-[var(--color-ink-muted)]">
                {formatDuration(agent.average_execution_time)}
              </span>
            ),
          },
          {
            key: 'cost',
            header: 'Est. cost',
            render: (agent) => (
              <span className="tabular-nums text-[var(--color-ink-muted)]">
                {formatMoneyPrecise(agent.estimated_total_cost)}
              </span>
            ),
          },
          {
            key: 'authority',
            header: 'Authority',
            render: (agent) => (
              <span
                className="text-[var(--color-ink-muted)]"
                title={describeAuthority(agent.authority_level).detail}
              >
                L{agent.authority_level} {describeAuthority(agent.authority_level).name}
              </span>
            ),
          },
          {
            key: 'last',
            header: 'Last run',
            render: (agent) => (
              <span className="text-[var(--color-ink-faint)]">
                {formatRelativeTime(agent.last_run_at)}
              </span>
            ),
          },
        ]}
      />
    </PageShell>
  );
}
