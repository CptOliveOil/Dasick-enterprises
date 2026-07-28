'use client';

import { useParams } from 'next/navigation';
import { useWorkforce } from '@/lib/store/workforce';
import { MissionInspector } from '@/components/missions/MissionInspector';
import { ApprovalCard } from '@/components/approvals/ApprovalCard';
import { EmptyState, Panel } from '@/components/ui';
import { PageShell, Section } from '@/components/layout/PageShell';
import { formatRelativeTime } from '@/lib/utils';

export default function MissionPage() {
  const params = useParams<{ id: string }>();
  const snapshot = useWorkforce((s) => s.snapshot);
  const loading = useWorkforce((s) => s.loading);
  const mission = snapshot?.missions.find((m) => m.id === params.id) ?? null;

  if (!mission) {
    return (
      <PageShell title="Mission">
        <Panel>
          <EmptyState title={loading ? 'Loading…' : 'No such mission'} />
        </Panel>
      </PageShell>
    );
  }

  const approvals = (snapshot?.approvals ?? []).filter((a) => a.mission_id === mission.id);
  const activity = (snapshot?.activity ?? []).filter((a) => a.mission_id === mission.id);

  return (
    <PageShell title={mission.title} description={mission.objective} wide>
      <div className="grid gap-4 lg:grid-cols-[380px_minmax(0,1fr)]">
        <Panel className="h-fit overflow-hidden">
          <div className="max-h-[76vh]">
            <MissionInspector mission={mission} />
          </div>
        </Panel>

        <div>
          <Section title={`Approvals · ${approvals.length}`}>
            {approvals.length === 0 ? (
              <Panel>
                <EmptyState
                  title="No approvals raised"
                  detail="Approval gates appear here as the mission reaches them."
                />
              </Panel>
            ) : (
              <div className="space-y-2">
                {approvals.map((approval) => (
                  <ApprovalCard key={approval.id} approval={approval} />
                ))}
              </div>
            )}
          </Section>

          <Section title="Activity">
            <Panel className="p-3">
              {activity.length === 0 && (
                <p className="py-3 text-center text-[13px] text-[var(--color-ink-faint)]">
                  Nothing recorded for this mission yet.
                </p>
              )}
              <ul className="space-y-2">
                {activity.map((entry) => (
                  <li key={entry.id} className="flex gap-3 text-[13px]">
                    <span className="w-[70px] shrink-0 text-[11px] text-[var(--color-ink-faint)]">
                      {formatRelativeTime(entry.created_at)}
                    </span>
                    <span className="text-[var(--color-ink-muted)]">{entry.message}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          </Section>
        </div>
      </div>
    </PageShell>
  );
}
