'use client';

import { useState } from 'react';
import { EMPTY, useWorkforce } from '@/lib/store/workforce';
import { ApprovalCard } from '@/components/approvals/ApprovalCard';
import { EmptyState, Panel } from '@/components/ui';
import { PageShell, Section } from '@/components/layout/PageShell';

/**
 * The operator's control surface. Agents never spend, publish or send anything
 * externally on their own — those actions arrive here first.
 */
export default function ApprovalsPage() {
  const approvals = useWorkforce((s) => s.snapshot?.approvals) ?? EMPTY;
  const [showResolved, setShowResolved] = useState(false);

  const pending = approvals.filter((a) => a.status === 'pending');
  const resolved = approvals.filter((a) => a.status !== 'pending');

  return (
    <PageShell
      title="Approvals"
      description="Nothing leaves Command Centre without you. Approve, reject, or send work back with feedback — requesting changes re-queues the task for the same agent."
    >
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
