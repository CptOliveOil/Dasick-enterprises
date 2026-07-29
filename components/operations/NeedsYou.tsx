'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Check, ChevronRight, MessageSquare, X } from 'lucide-react';
import { useWorkforce } from '@/lib/store/workforce';
import { formatRelativeTime } from '@/lib/utils';
import { Badge, Button, EmptyState, Panel, PanelHeader } from '@/components/ui';
import type { NeedsYouItem, Urgency } from '@/lib/operations/needs-you';

const URGENCY_TONE: Record<Urgency, { dot: string; label: string | null }> = {
  critical: { dot: '#f87171', label: 'Critical' },
  high: { dot: '#fbbf24', label: 'Waiting' },
  normal: { dot: '#38bdf8', label: null },
  low: { dot: '#64748b', label: null },
};

/**
 * Everything that needs the operator, and nothing that does not.
 *
 * The count in the header is the count in the list is the count of genuinely
 * pending decisions. If those three ever disagree, the panel has stopped being
 * useful — so they are all the same array.
 */
export function NeedsYou({
  items,
  compact,
  onChanged,
}: {
  items: NeedsYouItem[];
  compact?: boolean;
  onChanged?: () => void;
}) {
  return (
    <Panel className="overflow-hidden">
      <PanelHeader
        title="Needs you"
        action={
          items.length > 0 ? (
            <Badge tone={items.some((i) => i.urgency === 'critical') ? 'red' : 'amber'}>
              {items.length}
            </Badge>
          ) : undefined
        }
      />
      {items.length === 0 ? (
        <EmptyState
          title="Nothing needs you"
          detail="Every mission is either progressing or finished."
        />
      ) : (
        <ul className="divide-y divide-[var(--color-edge-soft)]">
          {items.slice(0, compact ? 4 : 20).map((item) => (
            <NeedsYouRow key={item.id} item={item} onChanged={onChanged} />
          ))}
        </ul>
      )}
      {compact && items.length > 4 && (
        <Link
          href="/approvals"
          className="block border-t border-[var(--color-edge-soft)] px-3.5 py-2 text-[12px] text-amber-400 underline-offset-4 hover:underline"
        >
          {items.length - 4} more →
        </Link>
      )}
    </Panel>
  );
}

function NeedsYouRow({ item, onChanged }: { item: NeedsYouItem; onChanged?: () => void }) {
  const refresh = useWorkforce((s) => s.refresh);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const approvalId = item.id.startsWith('approval:') ? item.id.slice('approval:'.length) : null;
  const tone = URGENCY_TONE[item.urgency];

  const decide = async (decision: 'approve' | 'reject') => {
    if (!approvalId) return;
    setPending(decision);
    setError(null);
    try {
      const response = await fetch(`/api/approvals/${approvalId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'The decision could not be recorded.');
      await refresh();
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The decision could not be recorded.');
    } finally {
      setPending(null);
    }
  };

  return (
    <li className="px-3.5 py-3">
      <div className="flex items-start gap-2.5">
        <span
          aria-hidden
          className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: tone.dot, boxShadow: `0 0 7px ${tone.dot}` }}
        />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium leading-snug">{item.title}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-[var(--color-ink-faint)]">
            {item.businessName && <span>{item.businessName}</span>}
            {item.missionNumber !== null && (
              <span>· #{String(item.missionNumber).padStart(3, '0')}</span>
            )}
            {item.agentName && <span>· {item.agentName}</span>}
            <span>· {formatRelativeTime(item.createdAt)}</span>
            {tone.label && <Badge tone={item.urgency === 'critical' ? 'red' : 'amber'}>{tone.label}</Badge>}
          </p>
          <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--color-ink-muted)]">
            {item.explanation}
          </p>

          {error && (
            <p className="mt-2 rounded-lg border border-red-500/25 bg-red-500/10 px-2.5 py-1.5 text-[11px] leading-snug text-red-300">
              {error}
            </p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-2">
            {approvalId && item.inlineDecision && (
              <>
                <Button
                  size="sm"
                  variant="success"
                  loading={pending === 'approve'}
                  onClick={() => decide('approve')}
                >
                  <Check className="h-3.5 w-3.5" />
                  Approve
                </Button>
                <Link href={item.href}>
                  <Button size="sm" variant="secondary">
                    <MessageSquare className="h-3.5 w-3.5" />
                    Review
                  </Button>
                </Link>
                <Button
                  size="sm"
                  variant="danger"
                  loading={pending === 'reject'}
                  onClick={() => decide('reject')}
                >
                  <X className="h-3.5 w-3.5" />
                  Reject
                </Button>
              </>
            )}
            {(!approvalId || !item.inlineDecision) && (
              <Link href={item.href}>
                <Button size="sm" variant="secondary">
                  Open
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}
