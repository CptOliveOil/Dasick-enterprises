'use client';

import { Check, MessageSquare, X } from 'lucide-react';
import { useState } from 'react';
import { useWorkforce } from '@/lib/store/workforce';
import { formatRelativeTime } from '@/lib/utils';
import Link from 'next/link';
import { Badge, Button, DemoNotice, inputClass } from '@/components/ui';
import { formatMoneyPrecise } from '@/lib/utils';
import { SourceResolution } from './SourceResolution';
import { ApprovalReview } from './ApprovalReview';
import { approvalOutcomes, explainApproval } from '@/lib/operations/needs-you';
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

      {/* What this decision actually does, in plain language. The operator
          should never have to read a task payload to know what they are
          agreeing to. */}
      <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--color-ink-faint)]">
        {explainApproval(approval)}
      </p>

      <ApprovalDetail approval={approval} compact={compact} />

      {/* The work itself. Shown for every kind except the source gate, which
          has its own per-claim resolution UI immediately above. Nobody should
          be asked to approve something they cannot read. */}
      {approval.kind !== 'source' && (
        <ApprovalReview approvalId={approval.id} autoLoad={!compact} />
      )}

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

          <p className="mt-2.5 text-[11px] leading-snug text-[var(--color-ink-faint)]">
            Approve: {approvalOutcomes(approval.kind).approve} · Reject:{' '}
            {approvalOutcomes(approval.kind).reject}
          </p>

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

/**
 * Kind-specific context, drawn from the approval's own payload.
 *
 * A decision should be makeable from this card: what is being approved, what it
 * cost, and a link straight to the thing itself.
 */
function ApprovalDetail({ approval, compact }: { approval: Approval; compact?: boolean }) {
  const payload = approval.payload as Record<string, unknown>;

  if (approval.kind === 'script') {
    const words = typeof payload.word_count === 'number' ? payload.word_count : null;
    const seconds =
      typeof payload.estimated_duration_seconds === 'number'
        ? payload.estimated_duration_seconds
        : null;
    const warnings = Array.isArray(payload.warnings) ? (payload.warnings as string[]) : [];
    const findings = typeof payload.findings === 'number' ? payload.findings : null;

    return (
      <div className="mt-2.5 space-y-1.5">
        <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--color-ink-faint)]">
          {words !== null && <Badge>{words.toLocaleString('en-GB')} words</Badge>}
          {seconds !== null && <Badge>~{Math.round(seconds / 60)} min</Badge>}
          {findings !== null && <Badge>{findings} claims checked</Badge>}
        </p>
        {warnings.length > 0 && (
          <p className="text-[11px] leading-snug text-amber-300">
            Outstanding: {warnings.join('; ')}
          </p>
        )}
        {typeof payload.script_id === 'string' && !compact && (
          <Link
            href={`/youtube/scripts/${payload.script_id}`}
            className="inline-block text-[12px] text-amber-400 underline-offset-4 hover:underline"
          >
            Read the full script →
          </Link>
        )}
      </div>
    );
  }

  if (approval.kind === 'source' && typeof payload.resolution_id === 'string') {
    const items = Array.isArray(payload.items)
      ? (payload.items as {
          id: string;
          claim: string;
          reason: string;
          current_source: string | null;
          location: string | null;
          category: string;
        }[])
      : [];
    return (
      <SourceResolution resolutionId={payload.resolution_id as string} items={items} />
    );
  }

  if (approval.kind === 'video' && typeof payload.video_id === 'string') {
    const verdict = typeof payload.verdict === 'string' ? payload.verdict : null;
    return (
      <div className="mt-2.5 space-y-1.5">
        {verdict && (
          <Badge tone={verdict === 'pass' ? 'emerald' : verdict === 'warning' ? 'amber' : 'red'}>
            QC {verdict}
          </Badge>
        )}
        <Link
          href={`/youtube/production/${payload.video_id}`}
          className="block text-[12px] text-amber-400 underline-offset-4 hover:underline"
        >
          Watch it, check the thumbnail and see the cost →
        </Link>
      </div>
    );
  }

  if (approval.kind === 'spend') {
    const estimate = typeof payload.estimate === 'number' ? payload.estimate : null;
    return estimate === null ? null : (
      <p className="mt-2.5">
        <Badge tone="amber">Estimated {formatMoneyPrecise(estimate)}</Badge>
        <span className="ml-2 text-[11px] text-[var(--color-ink-faint)]">
          Approving authorises this step only.
        </span>
      </p>
    );
  }

  return null;
}
