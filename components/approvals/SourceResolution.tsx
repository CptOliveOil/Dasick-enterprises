'use client';

import { useState } from 'react';
import { AlertTriangle, BookOpen, PenLine, Search, ShieldOff, Trash2 } from 'lucide-react';
import { useWorkforce } from '@/lib/store/workforce';
import { Badge, Button, Field, inputClass } from '@/components/ui';
import type { ResolutionAction } from '@/types/islamic';

interface ClaimItem {
  id: string;
  claim: string;
  reason: string;
  current_source: string | null;
  location: string | null;
  category: string;
  status?: string;
  action?: string | null;
  resolved_source?: string | null;
  override_reason?: string | null;
}

/**
 * Settling one unsourced religious claim.
 *
 * The claim itself is the largest thing on screen, because that is what the
 * operator is deciding about. Override is present, deliberate, and visually
 * last — it is a legitimate choice, but it should never be the easiest one, and
 * it asks for a reason before it will run.
 */
export function SourceResolution({
  resolutionId,
  items,
  onResolved,
}: {
  resolutionId: string;
  items: ClaimItem[];
  onResolved?: () => void;
}) {
  return (
    <div className="mt-2.5 space-y-2.5">
      {items.map((item) => (
        <ClaimCard
          key={item.id}
          resolutionId={resolutionId}
          item={item}
          onResolved={onResolved}
        />
      ))}
    </div>
  );
}

function ClaimCard({
  resolutionId,
  item,
  onResolved,
}: {
  resolutionId: string;
  item: ClaimItem;
  onResolved?: () => void;
}) {
  const refresh = useWorkforce((s) => s.refresh);
  const [open, setOpen] = useState<ResolutionAction | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(item.status && item.status !== 'unresolved' ? item.status : null);

  const act = async (action: ResolutionAction) => {
    if ((action === 'add_source' || action === 'edit_claim') && !text.trim()) {
      setOpen(action);
      return;
    }
    if (action === 'override' && !text.trim()) {
      // An override without a reason is exactly the sort of thing nobody can
      // explain three months later. Ask before doing it.
      setOpen('override');
      setError('Say why you are overriding this. It stays on the record.');
      return;
    }

    setBusy(action);
    setError(null);
    try {
      const response = await fetch(`/api/islamic/resolutions/${resolutionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_id: item.id,
          action,
          ...(action === 'add_source' ? { source: text.trim() } : {}),
          ...(action === 'edit_claim' ? { claim: text.trim() } : {}),
          ...(action === 'override' ? { reason: text.trim() } : {}),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'That could not be recorded.');

      setDone(
        action === 'research'
          ? 'researching'
          : action === 'override'
            ? 'overridden'
            : action === 'remove_claim'
              ? 'removed'
              : 'resolved',
      );
      setOpen(null);
      setText('');
      await refresh();
      onResolved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That could not be recorded.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.05] p-3">
      <p className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-300">
          Source required
        </span>
        <Badge>{item.category}</Badge>
        {item.location && <Badge>{item.location}</Badge>}
      </p>

      <blockquote className="mt-2 border-l-2 border-amber-400/40 pl-2.5 text-[13px] leading-relaxed">
        {item.claim}
      </blockquote>

      <p className="mt-2 text-[12px] leading-relaxed text-[var(--color-ink-muted)]">
        <span className="text-[var(--color-ink-faint)]">Why verification is needed: </span>
        {item.reason}
      </p>
      <p className="mt-1 text-[12px] text-[var(--color-ink-muted)]">
        <span className="text-[var(--color-ink-faint)]">Current source: </span>
        {item.current_source ?? <span className="text-[var(--color-ink-faint)]">none given</span>}
      </p>

      {done ? (
        <p className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[12px]">
          <Badge tone={done === 'overridden' ? 'red' : done === 'researching' ? 'amber' : 'emerald'}>
            {done === 'researching' ? 'Source Checker is researching' : done}
          </Badge>
          {done === 'overridden' && (
            <span className="flex items-center gap-1 text-[11px] text-red-300">
              <AlertTriangle className="h-3 w-3" />
              This stays flagged on the final quality check.
            </span>
          )}
        </p>
      ) : (
        <>
          {open && (
            <div className="mt-2.5">
              <Field
                label={
                  open === 'add_source'
                    ? 'Reference'
                    : open === 'edit_claim'
                      ? 'Replacement wording'
                      : 'Why are you overriding this?'
                }
              >
                <textarea
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  rows={2}
                  className={`${inputClass} resize-none`}
                  placeholder={
                    open === 'add_source'
                      ? 'e.g. Sahih Muslim 2699'
                      : open === 'edit_claim'
                        ? 'Rewrite the claim so it is supportable.'
                        : 'This is recorded against your name and shown at final approval.'
                  }
                  autoFocus
                />
              </Field>
            </div>
          )}

          {error && (
            <p className="mt-2 rounded-lg border border-red-500/25 bg-red-500/10 px-2.5 py-1.5 text-[11px] leading-snug text-red-300">
              {error}
            </p>
          )}

          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <Button
              size="sm"
              variant={open === 'add_source' ? 'primary' : 'secondary'}
              loading={busy === 'add_source'}
              onClick={() => (open === 'add_source' ? act('add_source') : setOpen('add_source'))}
            >
              <BookOpen className="h-3.5 w-3.5" />
              Add source
            </Button>
            <Button
              size="sm"
              variant="secondary"
              loading={busy === 'research'}
              onClick={() => act('research')}
            >
              <Search className="h-3.5 w-3.5" />
              Research source
            </Button>
            <Button
              size="sm"
              variant={open === 'edit_claim' ? 'primary' : 'secondary'}
              loading={busy === 'edit_claim'}
              onClick={() => (open === 'edit_claim' ? act('edit_claim') : setOpen('edit_claim'))}
            >
              <PenLine className="h-3.5 w-3.5" />
              Edit claim
            </Button>
            <Button
              size="sm"
              variant="secondary"
              loading={busy === 'remove_claim'}
              onClick={() => act('remove_claim')}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Remove claim
            </Button>
            <Button
              size="sm"
              variant="danger"
              loading={busy === 'override'}
              onClick={() => (open === 'override' ? act('override') : setOpen('override'))}
            >
              <ShieldOff className="h-3.5 w-3.5" />
              Override
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
