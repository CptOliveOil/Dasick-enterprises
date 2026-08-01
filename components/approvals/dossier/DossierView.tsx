'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronsDownUp,
  ChevronsUpDown,
  Copy,
  Download,
  FileText,
  Loader2,
  MessageSquare,
  Printer,
  Search,
  X,
} from 'lucide-react';
import { Badge, Button, inputClass } from '@/components/ui';
import { PanelBody } from './panels';
import { buildDocx, markdownFilename, slug } from '@/lib/approvals/export';
import { composeChangeRequest } from '@/lib/approvals/presets';
import type { ChangePreset, Dossier, Panel, Tone } from '@/lib/approvals/dossier/types';

/**
 * The editorial review screen.
 *
 * One screen for every approval in the product. It knows nothing about scripts,
 * videos, listings or businesses — it renders a summary, a set of panels and
 * three actions, and every one of those comes from the server as data. A new
 * business inherits this screen by existing.
 *
 * The layout is built around reading: a fixed measure for prose, a sticky index
 * so the operator never loses their place in a long document, and the decision
 * bar pinned to the bottom so approving is always one movement away from
 * whatever they are looking at — but never *above* the work, which is how a
 * summary-only screen talks someone into a decision they have not made.
 */

const TONE_TEXT: Record<Tone, string> = {
  neutral: 'text-[var(--color-ink)]',
  emerald: 'text-emerald-300',
  amber: 'text-amber-300',
  red: 'text-red-300',
  sky: 'text-sky-300',
};

export function DossierView({
  approvalId,
  onResolved,
  compact,
}: {
  approvalId: string;
  onResolved?: () => void | Promise<void>;
  /** Renders inside a card rather than as a page. */
  compact?: boolean;
}) {
  const [dossier, setDossier] = useState<Dossier | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/approvals/${approvalId}/dossier`);
      const raw = await response.text();
      let body: { dossier?: Dossier; error?: string } = {};
      try {
        body = raw ? JSON.parse(raw) : {};
      } catch {
        throw new Error(`The server replied with ${response.status}.`);
      }
      if (!response.ok || !body.dossier) {
        throw new Error(body.error ?? 'Could not load this review.');
      }
      setDossier(body.dossier);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load this review.');
    } finally {
      setLoading(false);
    }
  }, [approvalId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !dossier) {
    return (
      <p className="flex items-center gap-2 py-8 text-[13px] text-[var(--color-ink-muted)]">
        <Loader2 className="h-4 w-4 animate-spin" />
        Assembling the review…
      </p>
    );
  }

  if (error) {
    return (
      <p className="rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-[13px] text-red-300">
        {error}
      </p>
    );
  }

  if (!dossier) return null;

  return (
    <Review
      dossier={dossier}
      compact={compact}
      onResolved={async () => {
        await load();
        await onResolved?.();
      }}
    />
  );
}

/* ------------------------------------------------------------------ */

function Review({
  dossier,
  compact,
  onResolved,
}: {
  dossier: Dossier;
  compact?: boolean;
  onResolved: () => void | Promise<void>;
}) {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState(true);
  const container = useRef<HTMLDivElement>(null);

  const toggle = (id: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const expandAll = () => {
    setCollapsed(new Set());
    setExpanded(true);
  };
  const collapseAll = () => {
    setCollapsed(new Set(dossier.panels.map((panel) => panel.id)));
    setExpanded(false);
  };

  const jump = (id: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
    // After the panel has been re-opened, so the target has a position.
    requestAnimationFrame(() => {
      container.current
        ?.querySelector(`#panel-${CSS.escape(id)}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle.length < 2) return 0;
    return (JSON.stringify(dossier.panels).toLowerCase().match(new RegExp(escapeRegExp(needle), 'g')) ?? [])
      .length;
  }, [query, dossier.panels]);

  return (
    <div ref={container} className={compact ? 'mt-3' : ''}>
      <Summary dossier={dossier} compact={compact} />

      <Toolbar
        dossier={dossier}
        query={query}
        setQuery={setQuery}
        searching={searching}
        setSearching={setSearching}
        matches={matches}
        expanded={expanded}
        expandAll={expandAll}
        collapseAll={collapseAll}
        panels={dossier.panels}
        onJump={jump}
      />

      <div className="mt-5 space-y-5 print:space-y-8">
        {dossier.panels.map((panel) => (
          <PanelCard
            key={panel.id}
            panel={panel}
            query={query}
            open={!collapsed.has(panel.id)}
            onToggle={() => toggle(panel.id)}
          />
        ))}
      </div>

      {dossier.href && (
        <a
          href={dossier.href}
          className="mt-4 inline-block text-[13px] text-amber-400 underline-offset-4 hover:underline print:hidden"
        >
          Open the full record →
        </a>
      )}

      <Decision dossier={dossier} onResolved={onResolved} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Summary                                                             */
/* ------------------------------------------------------------------ */

function Summary({ dossier, compact }: { dossier: Dossier; compact?: boolean }) {
  return (
    <header>
      <h2
        className={`${compact ? 'text-[20px]' : 'text-[30px]'} font-semibold leading-[1.15] tracking-[-0.02em]`}
      >
        {dossier.summary.title}
      </h2>
      {dossier.summary.subtitle && (
        <p className="mt-1.5 max-w-[70ch] text-[15px] leading-relaxed text-[var(--color-ink-muted)]">
          {dossier.summary.subtitle}
        </p>
      )}

      {dossier.summary.attribution.length > 0 && (
        <p className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px] text-[var(--color-ink-faint)]">
          {dossier.summary.attribution.map((entry, index) => (
            <span key={`${entry.label}-${index}`}>
              <span className="uppercase tracking-[0.1em]">{entry.label}</span> {entry.value}
            </span>
          ))}
        </p>
      )}

      {dossier.summary.notice && (
        <p className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/[0.08] px-3.5 py-2.5 text-[13px] leading-relaxed text-amber-100/90">
          {dossier.summary.notice}
        </p>
      )}

      {dossier.source !== 'records' && (
        <p className="mt-3 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] px-3.5 py-2.5 text-[13px] leading-relaxed text-amber-100/80">
          {dossier.source === 'payload'
            ? 'The original records are gone, so this is the approval’s own snapshot of the work. It is what was produced, not what is stored now.'
            : 'This approval carries no reviewable content. Approving it would be a decision made blind.'}
        </p>
      )}

      {dossier.summary.metrics.length > 0 && (
        <dl className="mt-4 grid grid-cols-2 gap-x-5 gap-y-3.5 border-y border-[var(--color-edge)] py-4 sm:grid-cols-3 lg:grid-cols-5">
          {dossier.summary.metrics.map((metric) => (
            <div key={metric.label}>
              <dt className="text-[10.5px] uppercase tracking-[0.12em] text-[var(--color-ink-faint)]">
                {metric.label}
              </dt>
              <dd
                className={`mt-0.5 text-[17px] font-medium tabular-nums leading-tight ${
                  TONE_TEXT[metric.tone ?? 'neutral']
                }`}
              >
                {metric.value}
              </dd>
              {metric.hint && (
                <p className="mt-0.5 text-[11px] leading-snug text-[var(--color-ink-faint)]">
                  {metric.hint}
                </p>
              )}
            </div>
          ))}
        </dl>
      )}
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Toolbar                                                             */
/* ------------------------------------------------------------------ */

function Toolbar({
  dossier,
  query,
  setQuery,
  searching,
  setSearching,
  matches,
  expanded,
  expandAll,
  collapseAll,
  panels,
  onJump,
}: {
  dossier: Dossier;
  query: string;
  setQuery: (value: string) => void;
  searching: boolean;
  setSearching: (value: boolean) => void;
  matches: number;
  expanded: boolean;
  expandAll: () => void;
  collapseAll: () => void;
  panels: Panel[];
  onJump: (id: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const document_ = dossier.document;

  const copy = async () => {
    if (!document_) return;
    await navigator.clipboard.writeText(document_.markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const download = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="sticky top-0 z-10 -mx-1 mt-4 flex flex-wrap items-center gap-1.5 bg-[var(--color-void)]/85 px-1 py-2.5 backdrop-blur print:hidden">
      {panels.map((panel) => (
        <button
          key={panel.id}
          type="button"
          onClick={() => onJump(panel.id)}
          className="rounded-lg border border-[var(--color-edge)] px-2.5 py-1 text-[12px] text-[var(--color-ink-muted)] transition-colors hover:bg-white/[0.04] hover:text-[var(--color-ink)]"
        >
          {panel.title}
        </button>
      ))}

      <span className="mx-1 h-4 w-px bg-[var(--color-edge)]" />

      <IconButton
        label={expanded ? 'Collapse all' : 'Expand all'}
        onClick={expanded ? collapseAll : expandAll}
      >
        {expanded ? (
          <ChevronsDownUp className="h-3.5 w-3.5" />
        ) : (
          <ChevronsUpDown className="h-3.5 w-3.5" />
        )}
      </IconButton>

      {searching ? (
        <span className="flex items-center gap-1.5">
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search…"
            aria-label="Search this review"
            className={`${inputClass} h-7 w-40 py-0 text-[12px]`}
          />
          <span className="text-[11px] tabular-nums text-[var(--color-ink-faint)]">
            {query.trim().length < 2 ? '' : `${matches} match${matches === 1 ? '' : 'es'}`}
          </span>
          <IconButton
            label="Close search"
            onClick={() => {
              setQuery('');
              setSearching(false);
            }}
          >
            <X className="h-3.5 w-3.5" />
          </IconButton>
        </span>
      ) : (
        <IconButton label="Search" onClick={() => setSearching(true)}>
          <Search className="h-3.5 w-3.5" />
        </IconButton>
      )}

      {document_ && (
        <>
          <span className="mx-1 h-4 w-px bg-[var(--color-edge)]" />
          <IconButton label={copied ? 'Copied' : 'Copy'} onClick={copy}>
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          </IconButton>
          <IconButton
            label="Markdown"
            onClick={() =>
              download(
                new Blob([document_.markdown], { type: 'text/markdown;charset=utf-8' }),
                markdownFilename(document_.title),
              )
            }
          >
            <FileText className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton
            label="Word"
            onClick={() =>
              download(
                new Blob([buildDocx(document_.markdown) as unknown as BlobPart], {
                  type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                }),
                `${slug(document_.title)}.docx`,
              )
            }
          >
            <Download className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton label="PDF" onClick={() => window.print()}>
            <Printer className="h-3.5 w-3.5" />
          </IconButton>
        </>
      )}
    </div>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className="flex items-center gap-1.5 rounded-lg border border-[var(--color-edge)] px-2.5 py-1 text-[12px] text-[var(--color-ink-muted)] transition-colors hover:bg-white/[0.04] hover:text-[var(--color-ink)]"
    >
      {children}
      {label}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Panels                                                              */
/* ------------------------------------------------------------------ */

function PanelCard({
  panel,
  query,
  open,
  onToggle,
}: {
  panel: Panel;
  query: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <section
      id={`panel-${panel.id}`}
      className="scroll-mt-16 rounded-2xl border border-[var(--color-edge)] bg-[var(--color-panel)]/40 p-5 sm:p-6"
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start gap-2.5 text-left print:cursor-default"
      >
        <ChevronDown
          className={`mt-1 h-4 w-4 shrink-0 text-[var(--color-ink-faint)] transition-transform ${
            open ? '' : '-rotate-90'
          }`}
        />
        <span className="min-w-0 flex-1">
          <span className="block text-[17px] font-semibold tracking-[-0.01em]">{panel.title}</span>
          {panel.subtitle && (
            <span className="mt-0.5 block text-[13px] leading-relaxed text-[var(--color-ink-muted)]">
              {panel.subtitle}
            </span>
          )}
        </span>
      </button>

      {panel.note && open && (
        <p className="mt-3 rounded-xl border border-[var(--color-edge)] bg-white/[0.02] px-3.5 py-2.5 text-[12.5px] leading-relaxed text-[var(--color-ink-muted)]">
          {panel.note}
        </p>
      )}

      {open && (
        <div className="mt-5">
          <PanelBody panel={panel} query={query} open />
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Decision                                                            */
/* ------------------------------------------------------------------ */

function Decision({
  dossier,
  onResolved,
}: {
  dossier: Dossier;
  onResolved: () => void | Promise<void>;
}) {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [custom, setCustom] = useState('');

  const { approval, actions } = dossier;
  const presets = actions.requestChanges.presets;

  const brief = useMemo(
    () =>
      composeChangeRequest(
        presets.filter((preset) => chosen.has(preset.id)).map((preset) => preset.instruction),
        custom,
      ),
    [presets, chosen, custom],
  );

  if (approval.status !== 'pending') {
    return (
      <p className="mt-6 rounded-xl border border-[var(--color-edge)] bg-white/[0.02] px-4 py-3 text-[13px] text-[var(--color-ink-muted)] print:hidden">
        {approval.status === 'approved'
          ? 'Approved'
          : approval.status === 'rejected'
            ? 'Rejected'
            : 'Changes requested'}
        {approval.resolved_at &&
          ` · ${new Date(approval.resolved_at).toLocaleString('en-GB', {
            dateStyle: 'medium',
            timeStyle: 'short',
          })}`}
        {approval.feedback && ` — “${approval.feedback}”`}
      </p>
    );
  }

  const decide = async (decision: 'approve' | 'reject' | 'request_changes') => {
    if (decision === 'request_changes' && !brief.trim()) {
      setAsking(true);
      return;
    }
    setPending(decision);
    setError(null);
    try {
      const response = await fetch(`/api/approvals/${approval.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision,
          feedback: decision === 'request_changes' ? brief : undefined,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? 'The decision could not be recorded.');
      setChosen(new Set());
      setCustom('');
      setAsking(false);
      await onResolved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The decision could not be recorded.');
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="sticky bottom-0 mt-6 rounded-2xl border border-[var(--color-edge)] bg-[var(--color-panel)]/90 p-4 backdrop-blur print:hidden sm:p-5">
      {asking && (
        <ChangeRequestForm
          presets={presets}
          chosen={chosen}
          setChosen={setChosen}
          custom={custom}
          setCustom={setCustom}
          brief={brief}
          onCancel={() => setAsking(false)}
        />
      )}

      {error && (
        <p className="mb-3 rounded-xl border border-red-500/25 bg-red-500/10 px-3.5 py-2.5 text-[13px] text-red-300">
          {error}
        </p>
      )}

      <ul className="mb-3.5 space-y-1 text-[12.5px] leading-relaxed text-[var(--color-ink-faint)]">
        <li>
          <span className="text-emerald-300">Approve</span> — {actions.approve.consequence}
        </li>
        <li>
          <span className="text-red-300">Reject</span> — {actions.reject.consequence}
        </li>
        <li>
          <span className="text-amber-300">Request changes</span> —{' '}
          {actions.requestChanges.consequence}
        </li>
      </ul>

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="success"
          loading={pending === 'approve'}
          onClick={() => decide('approve')}
        >
          <Check className="h-3.5 w-3.5" />
          {actions.approve.label}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          loading={pending === 'request_changes'}
          onClick={() => (asking ? decide('request_changes') : setAsking(true))}
        >
          <MessageSquare className="h-3.5 w-3.5" />
          {asking ? 'Send these notes' : actions.requestChanges.label}
          {asking && chosen.size > 0 && (
            <Badge tone="amber">{chosen.size + (custom.trim() ? 1 : 0)}</Badge>
          )}
        </Button>
        <Button
          size="sm"
          variant="danger"
          loading={pending === 'reject'}
          onClick={() => decide('reject')}
        >
          <X className="h-3.5 w-3.5" />
          {actions.reject.label}
        </Button>
      </div>
    </div>
  );
}

/**
 * The change request, as a set of choices rather than an empty box.
 *
 * Presets compose: several selected plus a sentence of your own go to the agent
 * as one numbered brief, which is shown in full before it is sent. An operator
 * should never have to guess what the agent is about to be told.
 */
function ChangeRequestForm({
  presets,
  chosen,
  setChosen,
  custom,
  setCustom,
  brief,
  onCancel,
}: {
  presets: ChangePreset[];
  chosen: Set<string>;
  setChosen: (value: Set<string>) => void;
  custom: string;
  setCustom: (value: string) => void;
  brief: string;
  onCancel: () => void;
}) {
  const groups = useMemo(() => {
    const map = new Map<string, ChangePreset[]>();
    for (const preset of presets) {
      map.set(preset.group, [...(map.get(preset.group) ?? []), preset]);
    }
    return [...map.entries()];
  }, [presets]);

  const toggle = (id: string) => {
    const next = new Set(chosen);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setChosen(next);
  };

  return (
    <div className="mb-4 border-b border-[var(--color-edge)] pb-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[14px] font-medium">What should change?</h3>
        <button
          type="button"
          onClick={onCancel}
          className="text-[12px] text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"
        >
          Cancel
        </button>
      </div>

      <div className="mt-3 space-y-3">
        {groups.map(([group, entries]) => (
          <div key={group}>
            <p className="mb-1.5 text-[10.5px] uppercase tracking-[0.12em] text-[var(--color-ink-faint)]">
              {group}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {entries.map((preset) => {
                const on = chosen.has(preset.id);
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => toggle(preset.id)}
                    title={preset.instruction}
                    className={`rounded-full border px-3 py-1 text-[12.5px] transition-colors ${
                      on
                        ? 'border-amber-500/50 bg-amber-500/15 text-amber-100'
                        : 'border-[var(--color-edge)] text-[var(--color-ink-muted)] hover:bg-white/[0.04]'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <textarea
        value={custom}
        onChange={(event) => setCustom(event.target.value)}
        rows={2}
        placeholder="Anything else, in your own words…"
        aria-label="Custom instructions"
        className={`${inputClass} mt-3 resize-none`}
      />

      {brief.trim() && (
        <div className="mt-3">
          <p className="mb-1 text-[10.5px] uppercase tracking-[0.12em] text-[var(--color-ink-faint)]">
            The agent will be told
          </p>
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-xl border border-[var(--color-edge)] bg-white/[0.02] px-3.5 py-2.5 font-sans text-[12.5px] leading-relaxed text-[var(--color-ink-muted)]">
            {brief}
          </pre>
        </div>
      )}
    </div>
  );
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
