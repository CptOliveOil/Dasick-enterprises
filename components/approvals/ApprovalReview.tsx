'use client';

import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui';
import type { ApprovalReview as Review, ReviewItem } from '@/lib/approvals/review';

/**
 * The work an approval is asking about, shown before the decision is made.
 *
 * One component for every kind. It renders whatever the server resolved —
 * ideas, script sections, thumbnail concepts, a product concept, a spend — as
 * the same expandable cards, because from the operator's side they are the same
 * act: read this, then decide.
 *
 * Loaded from the database on demand. Nothing is regenerated and no provider is
 * called; reviewing a decision must not cost money.
 */
export function ApprovalReview({
  approvalId,
  /** Open on load. True in the approvals list, false in the compact panel. */
  autoLoad,
  itemNoun,
}: {
  approvalId: string;
  autoLoad?: boolean;
  itemNoun?: string;
}) {
  const [open, setOpen] = useState(Boolean(autoLoad));
  const [review, setReview] = useState<Review | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (review || loading) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/approvals/${approvalId}/review`);
      const raw = await response.text();
      let body: { review?: Review; error?: string } = {};
      try {
        body = raw ? JSON.parse(raw) : {};
      } catch {
        throw new Error(`The server replied with ${response.status}.`);
      }
      if (!response.ok || !body.review) {
        throw new Error(body.error ?? 'Could not load the detail.');
      }
      setReview(body.review);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load the detail.');
    } finally {
      setLoading(false);
    }
  }, [approvalId, review, loading]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const count = review?.items.length ?? 0;
  const noun = itemNoun ?? 'item';

  return (
    <div className="mt-2.5">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-1.5 text-[12px] font-medium text-amber-400 hover:underline"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        {open ? 'Hide the detail' : 'Review what was produced'}
        {loading && <Loader2 className="h-3 w-3 animate-spin" />}
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          {error && (
            <p className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-[12px] text-red-300">
              {error}
            </p>
          )}

          {review && (
            <>
              {(review.facts.length > 0 || review.source === 'payload') && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {review.facts.map((fact) => (
                    <Badge key={fact.label} tone={fact.tone ?? 'neutral'}>
                      {fact.label}: {fact.value}
                    </Badge>
                  ))}
                  {review.source === 'payload' && (
                    <Badge tone="amber">From the approval&rsquo;s own record</Badge>
                  )}
                </div>
              )}

              {review.notice && (
                <p className="rounded-lg border border-amber-500/25 bg-amber-500/[0.07] px-3 py-2 text-[12px] leading-relaxed text-amber-100/80">
                  {review.notice}
                </p>
              )}

              {review.items.length === 0 ? (
                <p className="text-[12px] leading-relaxed text-[var(--color-ink-faint)]">
                  This approval carries no reviewable content. That is worth knowing before you
                  decide — nothing here describes what would happen.
                </p>
              ) : (
                <>
                  <p className="text-[11px] text-[var(--color-ink-faint)]">
                    {count} {count === 1 ? noun : `${noun}s`} to review
                  </p>
                  <ul className="space-y-1.5">
                    {review.items.map((item, index) => (
                      <ReviewCard
                        key={item.id}
                        item={item}
                        index={index}
                        expanded={review.items.length <= 3}
                      />
                    ))}
                  </ul>
                </>
              )}

              <p className="text-[12px] leading-relaxed text-[var(--color-ink-muted)]">
                {review.action}
              </p>

              {review.href && (
                <a
                  href={review.href}
                  className="inline-block text-[12px] text-amber-400 underline-offset-4 hover:underline"
                >
                  Open the full record →
                </a>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** One item. Collapsed to its title and subtitle until opened. */
function ReviewCard({
  item,
  index,
  expanded,
}: {
  item: ReviewItem;
  index: number;
  expanded: boolean;
}) {
  const [open, setOpen] = useState(expanded);

  return (
    <li className="overflow-hidden rounded-lg border border-[var(--color-edge)] bg-white/[0.02]">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-start gap-2 px-3 py-2.5 text-left hover:bg-white/[0.03]"
      >
        <span className="mt-0.5 w-4 shrink-0 text-[11px] tabular-nums text-[var(--color-ink-faint)]">
          {index + 1}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-medium leading-snug">{item.title}</span>
          {item.subtitle && (
            <span className="mt-0.5 block text-[12px] leading-relaxed text-[var(--color-ink-muted)]">
              {item.subtitle}
            </span>
          )}
          {item.badges && item.badges.length > 0 && (
            <span className="mt-1.5 flex flex-wrap gap-1">
              {item.badges.map((badge) => (
                <Badge key={badge.label} tone={badge.tone ?? 'neutral'}>
                  {badge.label}
                </Badge>
              ))}
            </span>
          )}
        </span>
        {open ? (
          <ChevronDown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-ink-faint)]" />
        ) : (
          <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-ink-faint)]" />
        )}
      </button>

      {open && item.fields.length > 0 && (
        <dl className="space-y-2 border-t border-[var(--color-edge-soft)] px-3 py-2.5">
          {item.fields.map((field) => (
            <div key={field.label} className={field.long ? '' : 'flex flex-wrap gap-x-2'}>
              <dt className="text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-faint)]">
                {field.label}
              </dt>
              <dd
                className={`text-[12px] leading-relaxed text-[var(--color-ink-muted)] ${
                  field.long ? 'mt-0.5 whitespace-pre-wrap' : ''
                }`}
              >
                {field.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </li>
  );
}
