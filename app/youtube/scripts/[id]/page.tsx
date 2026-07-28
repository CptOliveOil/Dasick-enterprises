import { notFound } from 'next/navigation';
import { getWorkspace } from '@/lib/db/workspace';
import { formatRelativeTime } from '@/lib/utils';
import { Badge, Panel } from '@/components/ui';
import { PageShell, Section } from '@/components/layout/PageShell';
import { YOUTUBE_TABS } from '@/components/youtube/tabs';
import { ScriptEditor } from '@/components/youtube/ScriptEditor';
import type { FactCheckVerdict } from '@/types/domain';

export const dynamic = 'force-dynamic';

const VERDICT_TONE: Record<FactCheckVerdict, 'emerald' | 'amber' | 'red' | 'neutral'> = {
  verified: 'emerald',
  needs_review: 'amber',
  potentially_incorrect: 'red',
  unsourced: 'neutral',
};

export default async function ScriptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { store } = await getWorkspace('youtube');
  const script = await store.get('youtube_scripts', id);
  if (!script) notFound();

  const [versions, factChecks] = await Promise.all([
    store.list('youtube_script_versions', {
      where: { script_id: script.id },
      orderBy: { column: 'version', ascending: false },
    }),
    store.list('youtube_fact_checks', { where: { script_id: script.id } }),
  ]);
  const factCheck = factChecks[0] ?? null;

  return (
    <PageShell
      title={script.title}
      description={`${script.word_count.toLocaleString('en-GB')} words · ~${Math.round(
        script.estimated_duration_seconds / 60,
      )} minutes · ${script.tone}`}
      tabs={YOUTUBE_TABS}
      wide
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <ScriptEditor script={script} />

        <div>
          <Section title="Fact check">
            <Panel className="p-4">
              {factCheck ? (
                <>
                  <p className="flex items-center gap-2 text-[13px]">
                    <Badge tone={factCheck.passed ? 'emerald' : 'red'}>
                      {factCheck.passed ? 'Passed' : 'Blocked'}
                    </Badge>
                    <span className="text-[var(--color-ink-faint)]">
                      {formatRelativeTime(factCheck.created_at)}
                    </span>
                  </p>
                  <p className="mt-2 text-[12px] leading-relaxed text-[var(--color-ink-muted)]">
                    {factCheck.summary}
                  </p>
                  <ul className="mt-3 space-y-2">
                    {factCheck.findings.map((finding, i) => (
                      <li
                        key={i}
                        className="rounded-lg border border-[var(--color-edge)] bg-white/[0.02] p-2.5"
                      >
                        <Badge tone={VERDICT_TONE[finding.verdict]}>
                          {finding.verdict.replace('_', ' ')}
                        </Badge>
                        <p className="mt-1.5 text-[12px] leading-snug">{finding.claim}</p>
                        <p className="mt-1 text-[11px] leading-snug text-[var(--color-ink-muted)]">
                          {finding.reasoning}
                        </p>
                        {finding.suggested_correction && (
                          <p className="mt-1 text-[11px] leading-snug text-amber-300">
                            Suggested: {finding.suggested_correction}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="text-[13px] text-[var(--color-ink-muted)]">
                  Not fact checked yet. The Fact Checker runs automatically after drafting, and a
                  script with claims marked potentially incorrect cannot progress.
                </p>
              )}
            </Panel>
          </Section>

          <Section title={`Versions · ${versions.length}`}>
            <Panel className="overflow-hidden">
              <ul>
                {versions.map((version) => (
                  <li
                    key={version.id}
                    className="flex items-center gap-3 border-b border-[var(--color-edge-soft)] px-3.5 py-2.5 text-[12px] last:border-0"
                  >
                    <span className="font-mono text-[11px] text-amber-400">v{version.version}</span>
                    <span className="min-w-0 flex-1 truncate text-[var(--color-ink-muted)]">
                      {version.note}
                    </span>
                    <span className="shrink-0 text-[11px] text-[var(--color-ink-faint)]">
                      {formatRelativeTime(version.created_at)}
                    </span>
                  </li>
                ))}
                {versions.length === 0 && (
                  <li className="px-3.5 py-4 text-center text-[12px] text-[var(--color-ink-faint)]">
                    No stored versions.
                  </li>
                )}
              </ul>
            </Panel>
          </Section>
        </div>
      </div>
    </PageShell>
  );
}
