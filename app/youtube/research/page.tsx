import { getWorkspace } from '@/lib/db/workspace';
import { formatRelativeTime } from '@/lib/utils';
import { Badge, EmptyState, Panel } from '@/components/ui';
import { PageShell, Section } from '@/components/layout/PageShell';
import { YOUTUBE_TABS } from '@/components/youtube/tabs';
import { NoBusiness } from '@/components/youtube/NoBusiness';
import type { ClaimConfidence, ResearchFact } from '@/types/domain';

export const dynamic = 'force-dynamic';

const CONFIDENCE_TONE: Record<ClaimConfidence, 'emerald' | 'amber' | 'red'> = {
  verified: 'emerald',
  interpretation: 'amber',
  needs_verification: 'red',
};

const CONFIDENCE_LABEL: Record<ClaimConfidence, string> = {
  verified: 'Verified',
  interpretation: 'Interpretation',
  needs_verification: 'Needs verification',
};

export default async function YoutubeResearchPage() {
  const { store, business } = await getWorkspace('youtube');
  if (!business) return <NoBusiness tabs={YOUTUBE_TABS} title="YouTube" />;

  const [packages, ideas] = await Promise.all([
    store.list('youtube_research', {
      where: { business_id: business.id },
      orderBy: { column: 'created_at', ascending: false },
    }),
    store.list('youtube_ideas', { where: { business_id: business.id } }),
  ]);

  return (
    <PageShell
      title="Research"
      description="Research packages built for approved ideas. Every claim is classified so nothing unverified slips into a script unnoticed."
      tabs={YOUTUBE_TABS}
      wide
    >
      {packages.length === 0 ? (
        <Panel>
          <EmptyState
            title="No research packages yet"
            detail="Approve an idea and the researcher will build one."
          />
        </Panel>
      ) : (
        packages.map((pkg) => {
          const idea = ideas.find((i) => i.id === pkg.idea_id);
          return (
            <Section key={pkg.id} title={idea?.title ?? 'Research package'}>
              <Panel className="p-4">
                <p className="text-[11px] text-[var(--color-ink-faint)]">
                  Built {formatRelativeTime(pkg.created_at)}
                </p>
                <p className="mt-2 text-[13px] leading-relaxed text-[var(--color-ink-muted)]">
                  {pkg.overview}
                </p>

                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <FactList title="Facts" facts={pkg.facts} />
                  <FactList title="Statistics" facts={pkg.statistics} />
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  <Bullets title="Hooks" items={pkg.hooks} />
                  <Bullets title="Content gaps" items={pkg.content_gaps} />
                  <Bullets title="Viewer questions" items={pkg.viewer_questions} />
                  <Bullets title="Competitor coverage" items={pkg.competitor_coverage} />
                  <Bullets title="Interesting details" items={pkg.interesting_details} />
                  <Bullets title="Risks" items={pkg.risks} tone="amber" />
                </div>

                {pkg.uncertain_claims.length > 0 && (
                  <div className="mt-4 rounded-lg border border-amber-500/25 bg-amber-500/[0.07] p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-300">
                      Uncertain claims
                    </p>
                    <ul className="mt-1.5 space-y-1">
                      {pkg.uncertain_claims.map((claim, i) => (
                        <li key={i} className="text-[12px] leading-snug text-amber-100/80">
                          {claim}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {pkg.timeline.length > 0 && (
                  <div className="mt-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-ink-faint)]">
                      Timeline
                    </p>
                    <ul className="mt-1.5 space-y-1">
                      {pkg.timeline.map((entry, i) => (
                        <li key={i} className="flex gap-3 text-[12px]">
                          <span className="w-[110px] shrink-0 text-[var(--color-ink-faint)]">
                            {entry.when}
                          </span>
                          <span className="text-[var(--color-ink-muted)]">{entry.what}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </Panel>
            </Section>
          );
        })
      )}
    </PageShell>
  );
}

function FactList({ title, facts }: { title: string; facts: ResearchFact[] }) {
  if (facts.length === 0) return null;
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-ink-faint)]">
        {title}
      </p>
      <ul className="mt-1.5 space-y-2">
        {facts.map((fact, i) => (
          <li key={i} className="rounded-lg border border-[var(--color-edge)] bg-white/[0.02] p-2.5">
            <p className="flex items-start gap-2 text-[12px] leading-snug">
              <Badge tone={CONFIDENCE_TONE[fact.confidence]} className="shrink-0">
                {CONFIDENCE_LABEL[fact.confidence]}
              </Badge>
            </p>
            <p className="mt-1.5 text-[13px] leading-snug">{fact.claim}</p>
            {fact.detail && (
              <p className="mt-1 text-[12px] leading-snug text-[var(--color-ink-muted)]">
                {fact.detail}
              </p>
            )}
            <p className="mt-1 text-[11px] text-[var(--color-ink-faint)]">
              {fact.source ? `Source: ${fact.source}` : 'No source cited'}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Bullets({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone?: 'amber';
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <p
        className={`text-[11px] font-semibold uppercase tracking-[0.12em] ${
          tone === 'amber' ? 'text-amber-300' : 'text-[var(--color-ink-faint)]'
        }`}
      >
        {title}
      </p>
      <ul className="mt-1.5 space-y-1">
        {items.map((item, i) => (
          <li key={i} className="text-[12px] leading-snug text-[var(--color-ink-muted)]">
            • {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
