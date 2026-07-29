'use client';

import { useState } from 'react';
import { EMPTY, useWorkforce } from '@/lib/store/workforce';
import { ApprovalCard } from '@/components/approvals/ApprovalCard';
import { EmptyState, Panel } from '@/components/ui';
import { PageShell, Section, Tabs } from '@/components/layout/PageShell';
import { approvalGroupOf, type ApprovalGroup } from '@/types/domain';

const GROUP_TABS: { key: ApprovalGroup | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'content', label: 'Content' },
  { key: 'sources', label: 'Sources' },
  { key: 'budget', label: 'Budget' },
  { key: 'publishing', label: 'Publishing' },
  { key: 'memory', label: 'Memory' },
  { key: 'other', label: 'Other' },
];

/**
 * The operator's control surface. Agents never spend, publish or send anything
 * externally on their own — those actions arrive here first.
 */
export default function ApprovalsPage() {
  const approvals = useWorkforce((s) => s.snapshot?.approvals) ?? EMPTY;
  const filter = useWorkforce((s) => s.businessFilter);
  const [showResolved, setShowResolved] = useState(false);
  const [group, setGroup] = useState<ApprovalGroup | 'all'>('all');

  const scoped = filter ? approvals.filter((a) => a.business_id === filter) : approvals;
  const inGroup = (kind: Parameters<typeof approvalGroupOf>[0]) =>
    group === 'all' || approvalGroupOf(kind) === group;

  const pending = scoped.filter((a) => a.status === 'pending' && inGroup(a.kind));
  const resolved = scoped.filter((a) => a.status !== 'pending' && inGroup(a.kind));
  const pendingAll = scoped.filter((a) => a.status === 'pending');

  return (
    <PageShell
      title="Approvals"
      description="Nothing leaves Command Centre without you. Approve, reject, or send work back with feedback — requesting changes re-queues the task for the same agent."
    >
      <Tabs
        tabs={GROUP_TABS.map((tab) => {
          const count =
            tab.key === 'all'
              ? pendingAll.length
              : pendingAll.filter((approval) => approvalGroupOf(approval.kind) === tab.key)
                  .length;
          return {
            href: `#${tab.key}`,
            label: `${tab.label}${count > 0 ? ` (${count})` : ''}`,
          };
        })}
        onSelect={(href) => setGroup(href.slice(1) as ApprovalGroup | 'all')}
        active={`#${group}`}
      />

      <Section title={`Waiting on you · ${pending.length}`}>
        {pending.length === 0 ? (
          <Panel>
            <EmptyState
              title="Nothing waiting on you"
              detail="Approvals appear here the moment an agent reaches a gate."
            />
          </Panel>
        ) : (
          <div className="grid gap-2.5 md:grid-cols-2">
            {pending.map((approval) => (
              <ApprovalCard key={approval.id} approval={approval} />
            ))}
          </div>
        )}
      </Section>

      <Section
        title={`History · ${resolved.length}`}
        action={
          <button
            onClick={() => setShowResolved((open) => !open)}
            className="text-[11px] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
          >
            {showResolved ? 'Hide' : 'Show'}
          </button>
        }
      >
        {showResolved &&
          (resolved.length === 0 ? (
            <Panel>
              <EmptyState title="No decisions recorded yet" />
            </Panel>
          ) : (
            <div className="grid gap-2.5 md:grid-cols-2">
              {resolved.map((approval) => (
                <ApprovalCard key={approval.id} approval={approval} />
              ))}
            </div>
          ))}
      </Section>
    </PageShell>
  );
}
