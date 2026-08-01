'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui';
import type {
  Claim,
  DiffToken,
  DocumentPanel,
  ClaimsPanel,
  ItemsPanel,
  LedgerPanel,
  MediaPanel,
  Panel,
  ScenesPanel,
  Score,
  ScoresPanel,
  SourcesPanel,
  Tone,
  VersionsPanel,
} from '@/lib/approvals/dossier/types';
import type { ReviewField, ReviewItem } from '@/lib/approvals/review';

/**
 * The renderers behind every approval screen in the product.
 *
 * There is one component per *presentation shape*, not per business. A script
 * and a research report are both documents; a fact check and an Islamic source
 * check are both sets of claims; a thumbnail and a rendered video are both
 * media. That is why a business added later inherits this whole screen without
 * anyone writing a component for it — its builder returns panels, and panels
 * already know how to look.
 */

const TONE_TEXT: Record<Tone, string> = {
  neutral: 'text-[var(--color-ink-muted)]',
  emerald: 'text-emerald-300',
  amber: 'text-amber-300',
  red: 'text-red-300',
  sky: 'text-sky-300',
};

const TONE_EDGE: Record<Tone, string> = {
  neutral: 'border-[var(--color-edge)]',
  emerald: 'border-emerald-500/30',
  amber: 'border-amber-500/30',
  red: 'border-red-500/35',
  sky: 'border-sky-500/30',
};

/** The Badge component's tones and the dossier's are the same set. */
function BADGE_TONE(tone: Tone): 'neutral' | 'amber' | 'sky' | 'emerald' | 'red' {
  return tone;
}

export function PanelBody({ panel, query, open }: { panel: Panel; query: string; open: boolean }) {
  switch (panel.kind) {
    case 'document':
      return <DocumentBody panel={panel} query={query} open={open} />;
    case 'claims':
      return <ClaimsBody panel={panel} query={query} />;
    case 'sources':
      return <SourcesBody panel={panel} />;
    case 'scores':
      return <ScoresBody panel={panel} />;
    case 'scenes':
      return <ScenesBody panel={panel} query={query} open={open} />;
    case 'versions':
      return <VersionsBody panel={panel} />;
    case 'media':
      return <MediaBody panel={panel} />;
    case 'ledger':
      return <LedgerBody panel={panel} />;
    case 'items':
      return <ItemsBody panel={panel} open={open} />;
    case 'fields':
      return <FieldList fields={panel.fields} />;
  }
}

/* ------------------------------------------------------------------ */
/* Search highlighting                                                 */
/* ------------------------------------------------------------------ */

/** Marks every occurrence of the query, without touching the surrounding text. */
export function Highlight({ text, query }: { text: string; query: string }) {
  const parts = useMemo(() => {
    const needle = query.trim();
    if (needle.length < 2) return [{ text, hit: false }];
    const out: { text: string; hit: boolean }[] = [];
    const lower = text.toLowerCase();
    const target = needle.toLowerCase();
    let cursor = 0;
    for (;;) {
      const at = lower.indexOf(target, cursor);
      if (at === -1) break;
      if (at > cursor) out.push({ text: text.slice(cursor, at), hit: false });
      out.push({ text: text.slice(at, at + needle.length), hit: true });
      cursor = at + needle.length;
    }
    out.push({ text: text.slice(cursor), hit: false });
    return out;
  }, [text, query]);

  return (
    <>
      {parts.map((part, index) =>
        part.hit ? (
          <mark key={index} className="rounded-[3px] bg-amber-400/30 px-0.5 text-[var(--color-ink)]">
            {part.text}
          </mark>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Document                                                            */
/* ------------------------------------------------------------------ */

/**
 * The work, set as a document rather than as data.
 *
 * Wide line height, a measure capped near 68 characters and real space between
 * paragraphs, because the operator is being asked to *read* this — a decision
 * made from skimming a cramped column is the failure this whole screen exists
 * to fix.
 */
function DocumentBody({
  panel,
  query,
  open,
}: {
  panel: DocumentPanel;
  query: string;
  open: boolean;
}) {
  return (
    <div className="space-y-10">
      {panel.blocks.map((block) => (
        <section key={block.id} id={`block-${block.id}`}>
          <header className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span
              className={`text-[11px] font-medium uppercase tracking-[0.14em] ${
                TONE_TEXT[block.tone ?? 'neutral']
              }`}
            >
              {block.label}
            </span>
            <h4 className="text-[19px] font-semibold leading-tight tracking-[-0.01em]">
              <Highlight text={block.heading} query={query} />
            </h4>
            <span className="text-[11px] tabular-nums text-[var(--color-ink-faint)]">
              {block.words.toLocaleString('en-GB')} words · {formatSeconds(block.seconds)}
            </span>
          </header>
          {open && (
            <div className="max-w-[68ch] space-y-4">
              {block.body.split(/\n{2,}/).map((paragraph, index) => (
                <p
                  key={index}
                  className="whitespace-pre-wrap text-[16.5px] leading-[1.78] text-[var(--color-ink)]/90"
                >
                  <Highlight text={paragraph.trim()} query={query} />
                </p>
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Claims                                                              */
/* ------------------------------------------------------------------ */

function ClaimsBody({ panel, query }: { panel: ClaimsPanel; query: string }) {
  return (
    <div className="space-y-6">
      {panel.warnings.length > 0 && (
        <div>
          <h4 className="mb-2.5 text-[12px] font-medium uppercase tracking-[0.12em] text-amber-300">
            Needs your judgement · {panel.warnings.length}
          </h4>
          <ul className="space-y-2">
            {panel.warnings.map((claim) => (
              <ClaimCard key={claim.id} claim={claim} query={query} />
            ))}
          </ul>
        </div>
      )}

      <div>
        <h4 className="mb-2.5 text-[12px] font-medium uppercase tracking-[0.12em] text-emerald-300">
          Verified · {panel.verified.length}
        </h4>
        {panel.verified.length === 0 ? (
          <p className="text-[13px] leading-relaxed text-[var(--color-ink-muted)]">
            No claim was verified. Nothing in this work has been confirmed against a source.
          </p>
        ) : (
          <ul className="space-y-2">
            {panel.verified.map((claim) => (
              <ClaimCard key={claim.id} claim={claim} query={query} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ClaimCard({ claim, query }: { claim: Claim; query: string }) {
  return (
    <li className={`rounded-xl border bg-white/[0.02] p-3.5 ${TONE_EDGE[claim.tone]}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone={BADGE_TONE(claim.tone)}>{claim.status}</Badge>
        <Badge>{claim.category}</Badge>
        {claim.location && (
          <span className="text-[11px] text-[var(--color-ink-faint)]">in “{claim.location}”</span>
        )}
      </div>
      <p className="mt-2 text-[15px] leading-relaxed">
        <Highlight text={claim.claim} query={query} />
      </p>
      <p className="mt-2 text-[13px] leading-relaxed text-[var(--color-ink-muted)]">
        <span className="text-[var(--color-ink-faint)]">Why: </span>
        {claim.why}
      </p>
      {claim.source && (
        <p className="mt-1.5 break-words text-[12px] text-[var(--color-ink-faint)]">
          Source: {claim.source}
        </p>
      )}
      {claim.correction && (
        <p className="mt-1.5 rounded-lg border border-amber-500/25 bg-amber-500/[0.07] px-2.5 py-1.5 text-[13px] leading-relaxed text-amber-100/85">
          Suggested correction: {claim.correction}
        </p>
      )}
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Sources                                                             */
/* ------------------------------------------------------------------ */

function SourcesBody({ panel }: { panel: SourcesPanel }) {
  if (panel.groups.length === 0) {
    return (
      <p className="text-[13px] leading-relaxed text-[var(--color-ink-muted)]">
        No sources were recorded at all. Nothing in this work is attributable.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {panel.groups.map((group) => (
        <div key={group.name}>
          <div className="flex flex-wrap items-baseline gap-x-2.5">
            <h4 className={`text-[13px] font-semibold ${TONE_TEXT[group.tone]}`}>{group.name}</h4>
            <span className="text-[11px] text-[var(--color-ink-faint)]">
              {group.sources.length} source{group.sources.length === 1 ? '' : 's'}
            </span>
          </div>
          <p className="mt-0.5 text-[12px] leading-relaxed text-[var(--color-ink-faint)]">
            {group.reliability}
          </p>
          <ul className="mt-2 space-y-1.5">
            {group.sources.map((source) => (
              <li
                key={source.id}
                className="rounded-lg border border-[var(--color-edge)] bg-white/[0.02] px-3 py-2.5"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-[14px] font-medium">{source.title}</span>
                  <span className="text-[11px] tabular-nums text-[var(--color-ink-faint)]">
                    {source.citations} citation{source.citations === 1 ? '' : 's'}
                  </span>
                </div>
                {source.note && (
                  <p className="mt-1 break-all text-[11.5px] text-[var(--color-ink-faint)]">
                    {source.note.startsWith('http') ? (
                      <a
                        href={source.note}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex items-center gap-1 hover:text-amber-400 hover:underline"
                      >
                        {source.note}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      source.note
                    )}
                  </p>
                )}
                {source.usedIn.length > 0 && (
                  <p className="mt-1 text-[11.5px] text-[var(--color-ink-faint)]">
                    Used in: {source.usedIn.join(', ')}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Scores                                                              */
/* ------------------------------------------------------------------ */

function ScoresBody({ panel }: { panel: ScoresPanel }) {
  return (
    <div className="space-y-4">
      {panel.overall && <ScoreRow score={panel.overall} emphasis />}
      <div className="grid gap-3.5 sm:grid-cols-2">
        {panel.scores.map((score) => (
          <ScoreRow key={score.label} score={score} />
        ))}
      </div>
    </div>
  );
}

const BAND_COLOUR: Record<Score['band'], string> = {
  strong: 'bg-emerald-400',
  fair: 'bg-amber-400',
  weak: 'bg-red-400',
  unknown: 'bg-[var(--color-edge)]',
};

const BAND_TEXT: Record<Score['band'], Tone> = {
  strong: 'emerald',
  fair: 'amber',
  weak: 'red',
  unknown: 'neutral',
};

function ScoreRow({ score, emphasis }: { score: Score; emphasis?: boolean }) {
  return (
    <div className={emphasis ? 'rounded-xl border border-[var(--color-edge)] bg-white/[0.025] p-3.5' : ''}>
      <div className="flex items-baseline justify-between gap-3">
        <span className={`${emphasis ? 'text-[15px] font-semibold' : 'text-[13px] font-medium'}`}>
          {score.label}
        </span>
        <span
          className={`tabular-nums ${emphasis ? 'text-[19px] font-semibold' : 'text-[13px]'} ${
            TONE_TEXT[BAND_TEXT[score.band]]
          }`}
        >
          {score.value === null ? 'Not measurable' : score.value}
        </span>
      </div>
      <div className="mt-1.5 h-[5px] overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className={`h-full rounded-full transition-[width] duration-500 ${BAND_COLOUR[score.band]}`}
          style={{ width: `${score.value ?? 100}%`, opacity: score.value === null ? 0.25 : 1 }}
        />
      </div>
      <p className="mt-1.5 text-[11.5px] leading-relaxed text-[var(--color-ink-faint)]">
        {score.basis}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Scenes                                                              */
/* ------------------------------------------------------------------ */

function ScenesBody({
  panel,
  query,
  open,
}: {
  panel: ScenesPanel;
  query: string;
  open: boolean;
}) {
  return (
    <ol className="space-y-2.5">
      {panel.scenes.map((scene) => (
        <li
          key={scene.id}
          className="rounded-xl border border-[var(--color-edge)] bg-white/[0.02] p-3.5"
        >
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--color-ink-faint)]">
              Scene {scene.number}
            </span>
            <span className="text-[14px] font-medium">{scene.heading}</span>
            <span className="text-[11px] tabular-nums text-[var(--color-ink-faint)]">
              {formatSeconds(scene.seconds)}
            </span>
          </div>
          {open && (
            <>
              <p className="mt-2 max-w-[66ch] text-[14px] leading-[1.7] text-[var(--color-ink)]/80">
                <Highlight text={scene.narration} query={query} />
              </p>
              <ul className="mt-2.5 space-y-1">
                {scene.visuals.map((visual, index) => (
                  <li key={index} className="flex gap-2 text-[12.5px] leading-relaxed">
                    <span className="shrink-0 rounded-md border border-[var(--color-edge)] px-1.5 py-0.5 text-[10.5px] uppercase tracking-[0.08em] text-[var(--color-ink-faint)]">
                      {visual.kind}
                    </span>
                    <span className="text-[var(--color-ink-muted)]">{visual.suggestion}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </li>
      ))}
    </ol>
  );
}

/* ------------------------------------------------------------------ */
/* Versions                                                            */
/* ------------------------------------------------------------------ */

function VersionsBody({ panel }: { panel: VersionsPanel }) {
  const [showing, setShowing] = useState<number | null>(panel.diffs[0]?.to ?? null);
  const diff = panel.diffs.find((entry) => entry.to === showing) ?? null;

  return (
    <div className="space-y-5">
      <ul className="space-y-1.5">
        {panel.versions.map((version) => (
          <li
            key={version.id}
            className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 rounded-lg border border-[var(--color-edge)] bg-white/[0.02] px-3 py-2"
          >
            <span className="font-mono text-[12px] text-amber-400">v{version.version}</span>
            <span className="min-w-0 flex-1 text-[13px] text-[var(--color-ink-muted)]">
              {version.note}
            </span>
            <span className="text-[11px] tabular-nums text-[var(--color-ink-faint)]">
              {version.words.toLocaleString('en-GB')} words ·{' '}
              {new Date(version.created_at).toLocaleString('en-GB', {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </span>
          </li>
        ))}
      </ul>

      {panel.diffs.length > 0 && (
        <div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[12px] text-[var(--color-ink-faint)]">Compare:</span>
            {panel.diffs.map((entry) => (
              <button
                key={`${entry.from}-${entry.to}`}
                type="button"
                onClick={() => setShowing(entry.to)}
                className={`rounded-lg border px-2.5 py-1 text-[12px] transition-colors ${
                  showing === entry.to
                    ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
                    : 'border-[var(--color-edge)] text-[var(--color-ink-muted)] hover:bg-white/[0.03]'
                }`}
              >
                v{entry.from} → v{entry.to}
              </button>
            ))}
          </div>

          {diff && (
            <div className="mt-3 space-y-4">
              {diff.sections
                .filter((section) => section.status !== 'unchanged')
                .map((section, index) => (
                  <div key={index}>
                    <p className="mb-1.5 flex items-center gap-2 text-[13px] font-medium">
                      {section.heading}
                      <Badge
                        tone={
                          section.status === 'added'
                            ? 'emerald'
                            : section.status === 'removed'
                              ? 'red'
                              : 'amber'
                        }
                      >
                        {section.status}
                      </Badge>
                    </p>
                    <div className="grid gap-2.5 lg:grid-cols-2">
                      <DiffColumn label={`v${diff.from}`} tokens={section.before} />
                      <DiffColumn label={`v${diff.to}`} tokens={section.after} />
                    </div>
                  </div>
                ))}
              {diff.sections.every((section) => section.status === 'unchanged') && (
                <p className="text-[13px] text-[var(--color-ink-muted)]">
                  Nothing changed between these versions.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <div>
        <h4 className="mb-2 text-[12px] font-medium uppercase tracking-[0.12em] text-[var(--color-ink-faint)]">
          Approval history
        </h4>
        <ul className="space-y-1">
          {panel.history.map((entry, index) => (
            <li key={index} className="text-[13px] leading-relaxed">
              <span className={TONE_TEXT[entry.tone]}>{entry.decision}</span>
              <span className="text-[var(--color-ink-faint)]">
                {' '}
                ·{' '}
                {new Date(entry.at).toLocaleString('en-GB', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              </span>
              {entry.feedback && (
                <span className="text-[var(--color-ink-muted)]"> — “{entry.feedback}”</span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function DiffColumn({ label, tokens }: { label: string; tokens: DiffToken[] }) {
  return (
    <div className="rounded-lg border border-[var(--color-edge)] bg-white/[0.015] p-3">
      <p className="mb-1.5 font-mono text-[11px] text-[var(--color-ink-faint)]">{label}</p>
      <p className="whitespace-pre-wrap text-[14px] leading-[1.7]">
        {tokens.length === 0 ? (
          <span className="text-[var(--color-ink-faint)]">—</span>
        ) : (
          tokens.map((token, index) => (
            <span
              key={index}
              className={
                token.change === 'add'
                  ? 'rounded-[3px] bg-emerald-500/20 text-emerald-100'
                  : token.change === 'remove'
                    ? 'rounded-[3px] bg-red-500/20 text-red-100 line-through decoration-red-400/50'
                    : 'text-[var(--color-ink)]/75'
              }
            >
              {token.text}
            </span>
          ))
        )}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Media, ledger, items, fields                                        */
/* ------------------------------------------------------------------ */

function MediaBody({ panel }: { panel: MediaPanel }) {
  return (
    <div className="space-y-4">
      {panel.items.map((item) => (
        <figure key={item.id} className="rounded-xl border border-[var(--color-edge)] p-3">
          <figcaption className="mb-2 text-[13px] font-medium">{item.label}</figcaption>
          {item.url === null ? (
            <p className="rounded-lg border border-amber-500/25 bg-amber-500/[0.07] px-3 py-2 text-[12.5px] leading-relaxed text-amber-100/85">
              {item.note}
            </p>
          ) : item.mediaKind === 'image' ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={item.url}
              alt={item.label}
              className="w-full rounded-lg border border-[var(--color-edge)]"
            />
          ) : item.mediaKind === 'video' ? (
            <video src={item.url} controls className="w-full rounded-lg" />
          ) : (
            <audio src={item.url} controls className="w-full" />
          )}
          {item.url !== null && item.note && (
            <p className="mt-2 text-[12px] text-amber-300">{item.note}</p>
          )}
          {item.fields.length > 0 && <FieldList fields={item.fields} compact />}
        </figure>
      ))}
    </div>
  );
}

function LedgerBody({ panel }: { panel: LedgerPanel }) {
  return (
    <dl className="space-y-2.5">
      {panel.lines.map((line) => (
        <div key={line.label} className="flex flex-wrap items-baseline justify-between gap-x-4">
          <div className="min-w-0">
            <dt className={line.emphasis ? 'text-[15px] font-medium' : 'text-[13px]'}>
              {line.label}
            </dt>
            {line.hint && (
              <p className="text-[11.5px] leading-relaxed text-[var(--color-ink-faint)]">
                {line.hint}
              </p>
            )}
          </div>
          <dd
            className={`tabular-nums ${line.emphasis ? 'text-[22px] font-semibold' : 'text-[14px]'} ${
              TONE_TEXT[line.tone ?? 'neutral']
            }`}
          >
            {line.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function ItemsBody({ panel, open }: { panel: ItemsPanel; open: boolean }) {
  return (
    <ul className="space-y-2">
      {panel.items.map((item, index) => (
        <ItemCard key={item.id} item={item} index={index} defaultOpen={open} />
      ))}
    </ul>
  );
}

function ItemCard({
  item,
  index,
  defaultOpen,
}: {
  item: ReviewItem;
  index: number;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <li className="overflow-hidden rounded-xl border border-[var(--color-edge)] bg-white/[0.02]">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-start gap-2.5 px-3.5 py-3 text-left hover:bg-white/[0.03]"
      >
        <span className="mt-0.5 w-5 shrink-0 text-[12px] tabular-nums text-[var(--color-ink-faint)]">
          {index + 1}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-medium leading-snug">{item.title}</span>
          {item.subtitle && (
            <span className="mt-1 block text-[13px] leading-relaxed text-[var(--color-ink-muted)]">
              {item.subtitle}
            </span>
          )}
          {item.badges && item.badges.length > 0 && (
            <span className="mt-2 flex flex-wrap gap-1">
              {item.badges.map((badge) => (
                <Badge key={badge.label} tone={badge.tone ?? 'neutral'}>
                  {badge.label}
                </Badge>
              ))}
            </span>
          )}
        </span>
        {open ? (
          <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-[var(--color-ink-faint)]" />
        ) : (
          <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-[var(--color-ink-faint)]" />
        )}
      </button>
      {open && item.fields.length > 0 && (
        <div className="border-t border-[var(--color-edge-soft)] px-3.5 py-3">
          <FieldList fields={item.fields} />
        </div>
      )}
    </li>
  );
}

function FieldList({ fields, compact }: { fields: ReviewField[]; compact?: boolean }) {
  return (
    <dl className={compact ? 'mt-2 space-y-1.5' : 'space-y-3'}>
      {fields.map((field) => (
        <div key={field.label} className={field.long ? '' : 'flex flex-wrap gap-x-2.5'}>
          <dt className="text-[11px] uppercase tracking-[0.1em] text-[var(--color-ink-faint)]">
            {field.label}
          </dt>
          <dd
            className={`text-[13.5px] leading-relaxed text-[var(--color-ink-muted)] ${
              field.long ? 'mt-1 max-w-[68ch] whitespace-pre-wrap' : ''
            }`}
          >
            {field.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function formatSeconds(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  if (total < 60) return `${total}s`;
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return rest === 0 ? `${minutes}m` : `${minutes}m ${rest}s`;
}
