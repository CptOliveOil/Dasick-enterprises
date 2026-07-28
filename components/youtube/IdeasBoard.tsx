'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Check, RefreshCw, Sparkles, X } from 'lucide-react';
import { Badge, Button, DemoNotice, EmptyState, Field, Panel, inputClass } from '@/components/ui';
import { ScoreBar, Section } from '@/components/layout/PageShell';
import type { YoutubeIdea } from '@/types/domain';

const STATUS_TONE: Record<YoutubeIdea['status'], 'neutral' | 'emerald' | 'red' | 'amber'> = {
  proposed: 'neutral',
  approved: 'emerald',
  rejected: 'red',
  saved: 'amber',
};

/**
 * The first real AI workflow: ask the researcher for opportunities, then act on
 * them. Approving an idea can kick straight into research → script → fact check.
 */
export function IdeasBoard({
  ideas,
  businessId,
  defaultNiche,
  defaultAudience,
}: {
  ideas: YoutubeIdea[];
  businessId: string | null;
  defaultNiche: string;
  defaultAudience: string;
}) {
  const router = useRouter();
  const [niche, setNiche] = useState(defaultNiche);
  const [count, setCount] = useState(10);
  const [audience, setAudience] = useState(defaultAudience);
  const [instructions, setInstructions] = useState('');
  const [running, setRunning] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const generate = async () => {
    setRunning(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch('/api/youtube/ideas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_id: businessId ?? undefined,
          niche,
          count,
          audience,
          instructions,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Idea generation failed.');
      const failed = data.run?.results?.find((r: { status: string }) => r.status === 'failed');
      if (failed) throw new Error(failed.error ?? 'The researcher could not complete the task.');
      setNotice(`${data.ideas?.length ?? 0} opportunities generated.`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Idea generation failed.');
    } finally {
      setRunning(false);
    }
  };

  const decide = async (
    idea: YoutubeIdea,
    status: YoutubeIdea['status'],
    startScript = false,
  ) => {
    setPending(idea.id);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/youtube/ideas/${idea.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, start_script: startScript }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Could not update the idea.');
      if (data.mission) {
        setNotice(
          `Mission #${String(data.mission.number).padStart(3, '0')} created — research, script and fact check are queued.`,
        );
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update the idea.');
    } finally {
      setPending(null);
    }
  };

  const sorted = [...ideas].sort((a, b) => b.score - a.score);

  return (
    <>
      <Section title="Find video ideas">
        <Panel className="p-4">
          <div className="grid gap-3 md:grid-cols-4">
            <Field label="Channel / niche">
              <input
                value={niche}
                onChange={(event) => setNiche(event.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Number of ideas">
              <input
                type="number"
                min={1}
                max={20}
                value={count}
                onChange={(event) => setCount(Number(event.target.value))}
                className={inputClass}
              />
            </Field>
            <Field label="Target audience">
              <input
                value={audience}
                onChange={(event) => setAudience(event.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Additional instructions">
              <input
                value={instructions}
                onChange={(event) => setInstructions(event.target.value)}
                placeholder="Optional"
                className={inputClass}
              />
            </Field>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button
              variant="primary"
              onClick={generate}
              loading={running}
              disabled={!niche.trim()}
            >
              <Sparkles className="h-3.5 w-3.5" />
              Find video ideas
            </Button>
            <span className="text-[11px] text-[var(--color-ink-faint)]">
              Creates a mission, assigns the YouTube Researcher, and stores validated results.
            </span>
          </div>

          {error && (
            <p className="mt-3 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-[12px] text-red-300">
              {error}
            </p>
          )}
          {notice && (
            <p className="mt-3 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-[12px] text-emerald-300">
              {notice}
            </p>
          )}
        </Panel>
      </Section>

      <Section title={`Opportunities · ${ideas.length}`}>
        {sorted.length === 0 ? (
          <Panel>
            <EmptyState
              title="No ideas yet"
              detail="Run the researcher above to generate scored opportunities."
            />
          </Panel>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {sorted.map((idea) => (
              <Panel key={idea.id} className="p-4">
                <header className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-[14px] font-medium leading-snug">{idea.title}</h3>
                    <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--color-ink-faint)]">
                      <span>{idea.topic}</span>
                      <Badge tone={STATUS_TONE[idea.status]}>{idea.status}</Badge>
                      {idea.is_demo && <DemoNotice />}
                    </p>
                  </div>
                  <ScoreBar score={idea.score} className="shrink-0" />
                </header>

                <p className="mt-2.5 text-[13px] leading-relaxed text-[var(--color-ink-muted)]">
                  {idea.summary}
                </p>

                <dl className="mt-3 grid grid-cols-5 gap-2 border-t border-[var(--color-edge-soft)] pt-3">
                  {(
                    [
                      ['Demand', idea.breakdown.demand],
                      ['Gap', idea.breakdown.competition],
                      ['Money', idea.breakdown.monetisation],
                      ['Longevity', idea.breakdown.longevity],
                      ['Click', idea.breakdown.click_potential],
                    ] as const
                  ).map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-[9px] uppercase tracking-[0.1em] text-[var(--color-ink-faint)]">
                        {label}
                      </dt>
                      <dd className="mt-0.5 text-[13px] tabular-nums">{Math.round(value)}</dd>
                    </div>
                  ))}
                </dl>

                <p className="mt-3 text-[12px] leading-relaxed text-[var(--color-ink-muted)]">
                  <span className="text-[var(--color-ink-faint)]">Why it might work — </span>
                  {idea.why_it_might_work}
                </p>

                {idea.status === 'proposed' && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="success"
                      loading={pending === idea.id}
                      onClick={() => decide(idea, 'approved', true)}
                    >
                      <Check className="h-3.5 w-3.5" />
                      Approve &amp; start script
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => decide(idea, 'approved')}>
                      Approve only
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => decide(idea, 'saved')}>
                      Save
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => decide(idea, 'rejected')}>
                      <X className="h-3.5 w-3.5" />
                      Reject
                    </Button>
                  </div>
                )}

                {idea.status !== 'proposed' && (
                  <div className="mt-3">
                    <Button size="sm" variant="ghost" onClick={() => decide(idea, 'proposed')}>
                      <RefreshCw className="h-3.5 w-3.5" />
                      Move back to proposed
                    </Button>
                  </div>
                )}
              </Panel>
            ))}
          </div>
        )}
      </Section>
    </>
  );
}
