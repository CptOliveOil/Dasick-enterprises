'use client';

import { Check, MessageSquare, X } from 'lucide-react';
import { useState } from 'react';
import { useWorkforce } from '@/lib/store/workforce';
import { formatRelativeTime } from '@/lib/utils';
import { Button, DemoNotice, inputClass } from '@/components/ui';
import type { Approval } from '@/types/domain';

/**
 * One decision the operator has to make. Approve, reject, or send it back with
 * feedback — the third option re-queues the task rather than killing the mission.
 */
export function ApprovalCard({ approval, compact }: { approval: Approval; compact?: boolean }) {
  const snapshot = useWorkforce((s) => s.snapshot);
  const refresh = useWorkforce((s) => s.refresh);
  const setBusy = useWorkforce((s) => s.setBusy);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const agent = snapshot?.agents.find((a) => a.id === approval.agent_id) ?? null;
  const business = snapshot?.businesses.find((b) => b.id === approval.business_id) ?? null;

  const decide = async (decision: 'approve' | 'reject' | 'request_changes') => {
    if (decision === 'request_changes' && !feedback.trim()) {
      setShowFeedback(true);
      return;
    }
    setPending(decision);
    setBusy('Resolving approval');
    setError(null);
    try {
      const response = await fetch(`/api/approvals/${approval.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, feedback: feedback.trim() || undefined }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'The decision could not be recorded.');
      setFeedback('');
      setShowFeedback(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The decision could not be recorded.');
    } finally {
      setPending(null);
      setBusy(null);
      await refresh();
    }
  };

  const resolved = approval.status !== 'pending';

  return (
    <article
      className={`rounded-xl border border-[var(--color-edge)] bg-white/[0.025] ${compact ? 'p-2.5' : 'p-3.5'}`}
    >
      <header className="flex items-start gap-2.5">
        {agent && (
          <span
            className="mt-1 h-2 w-2 shrink-0 rounded-full"
            style={{
              backgroundColor: agent.visual.colour,
              boxShadow: `0 0 8px ${agent.visual.colour}`,
            }}
          />
        )}
        <div className="min-w-0 flex-1">
          <p className={`${compact ? 'text-[13px]' : 'text-[14px]'} font-medium leading-snug`}>
            {approval.title}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--color-ink-faint)]">
            {business && <span>{business.name}</span>}
            {agent && <span>· {agent.name}</span>}
            <span>· {formatRelativeTime(approval.created_at)}</span>
            {approval.is_demo && <DemoNotice />}
          </p>
        </div>
      </header>

      <p
        className={`mt-2 ${compact ? 'text-[12px]' : 'text-[13px]'} leading-relaxed text-[var(--color-ink-muted)]`}
      >
        {approval.summary}
      </p>

      {resolved ? (
        <p className="mt-2.5 text-[12px] text-[var(--color-ink-faint)]">
          {approval.status === 'approved'
            ? 'Approved'
            : approval.status === 'rejected'
              ? 'Rejected'
              : 'Changes requested'}
          {approval.resolved_at && ` · ${formatRelativeTime(approval.resolved_at)}`}
          {approval.feedback && ` — “${approval.feedback}”`}
        </p>
      ) : (
        <>
          {showFeedback && (
            <div className="mt-2.5">
              <textarea
                value={feedback}
                onChange={(event) => setFeedback(event.target.value)}
                rows={2}
                placeholder="What should change? e.g. Make the first 30 seconds more engaging."
                className={`${inputClass} resize-none`}
                aria-label="Requested changes"
              />
            </div>
          )}

          {error && (
            <p className="mt-2 rounded-lg border border-red-500/25 bg-red-500/10 px-2.5 py-1.5 text-[12px] text-red-300">
              {error}
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="success"
              loading={pending === 'approve'}
              onClick={() => decide('approve')}
            >
              <Check className="h-3.5 w-3.5" />
              Approve
            </Button>
            <Button
              size="sm"
              variant="secondary"
              loading={pending === 'request_changes'}
              onClick={() => decide('request_changes')}
            >
              <MessageSquare className="h-3.5 w-3.5" />
              Request changes
            </Button>
            <Button
              size="sm"
              variant="danger"
              loading={pending === 'reject'}
              onClick={() => decide('reject')}
            >
              <X className="h-3.5 w-3.5" />
              Reject
            </Button>
          </div>
        </>
      )}
    </article>
  );
}
