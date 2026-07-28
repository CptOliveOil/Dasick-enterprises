'use client';

import Link from 'next/link';
import { EMPTY, useWorkforce } from '@/lib/store/workforce';
import { MISSION_STATUS_STYLES } from '@/lib/agents/status';
import { formatRelativeTime, missionLabel } from '@/lib/utils';
import { Badge, DemoNotice, ProgressBar } from '@/components/ui';
import { DataTable, PageShell } from '@/components/layout/PageShell';
import type { Mission } from '@/types/domain';

export default function MissionsPage() {
  const missions = useWorkforce((s) => s.snapshot?.missions) ?? EMPTY;
  const businesses = useWorkforce((s) => s.snapshot?.businesses) ?? EMPTY;
  const tasks = useWorkforce((s) => s.snapshot?.tasks) ?? EMPTY;

  return (
    <PageShell
      title="Missions"
      description="A mission is a goal the workforce is working towards. It contains tasks, dependencies and approval gates."
      wide
    >
      <DataTable<Mission>
        rows={missions}
        rowKey={(mission) => mission.id}
        empty="No missions yet. Give the Commander an instruction to create one."
        columns={[
          {
            key: 'number',
            header: '#',
            className: 'w-[64px] font-mono text-amber-400',
            render: (mission) => missionLabel(mission.number),
          },
          {
            key: 'title',
            header: 'Mission',
            render: (mission) => (
              <Link href={`/missions/${mission.id}`} className="block">
                <span className="flex items-center gap-2">
                  <span className="font-medium">{mission.title}</span>
                  {mission.is_demo && <DemoNotice />}
                </span>
                <span className="mt-0.5 block max-w-xl truncate text-[11px] text-[var(--color-ink-faint)]">
                  {mission.objective}
                </span>
              </Link>
            ),
          },
          {
            key: 'business',
            header: 'Business',
            render: (mission) => (
              <span className="text-[var(--color-ink-muted)]">
                {businesses.find((b) => b.id === mission.business_id)?.name ?? 'Global'}
              </span>
            ),
          },
          {
            key: 'status',
            header: 'Status',
            render: (mission) => {
              const style = MISSION_STATUS_STYLES[mission.status];
              return <Badge className={`${style.bg} ${style.text}`}>{style.label}</Badge>;
            },
          },
          {
            key: 'steps',
            header: 'Steps',
            render: (mission) => {
              const missionTasks = tasks.filter((t) => t.mission_id === mission.id);
              const done = missionTasks.filter((t) => t.status === 'completed').length;
              return (
                <span className="text-[var(--color-ink-muted)]">
                  {done} / {missionTasks.length}
                </span>
              );
            },
          },
          {
            key: 'progress',
            header: 'Progress',
            className: 'w-[140px]',
            render: (mission) => (
              <span className="block">
                <ProgressBar value={mission.progress} label="Mission progress" />
                <span className="mt-1 block text-[11px] text-[var(--color-ink-faint)]">
                  {mission.progress}%
                </span>
              </span>
            ),
          },
          {
            key: 'updated',
            header: 'Updated',
            render: (mission) => (
              <span className="text-[var(--color-ink-faint)]">
                {formatRelativeTime(mission.updated_at)}
              </span>
            ),
          },
        ]}
      />
    </PageShell>
  );
}
