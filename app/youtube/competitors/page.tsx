import { getWorkspace } from '@/lib/db/workspace';
import { getYoutubeProvider } from '@/lib/integrations/platforms';
import { Badge, EmptyState, Panel } from '@/components/ui';
import { PageShell, Section } from '@/components/layout/PageShell';
import { YOUTUBE_TABS } from '@/components/youtube/tabs';
import { NoBusiness } from '@/components/youtube/NoBusiness';

export const dynamic = 'force-dynamic';

/**
 * Competitor intelligence needs live platform data to be worth anything, so
 * rather than fabricating a dashboard this states plainly what is missing and
 * shows the competitor observations research packages have actually produced.
 */
export default async function YoutubeCompetitorsPage() {
  const { store, business } = await getWorkspace('youtube');
  if (!business) return <NoBusiness tabs={YOUTUBE_TABS} title="YouTube" />;

  const connected = getYoutubeProvider().connected;
  const research = await store.list('youtube_research', { where: { business_id: business.id } });
  const observations = research.flatMap((r) =>
    r.competitor_coverage.map((note) => ({ id: `${r.id}-${note}`, note })),
  );
  const gaps = research.flatMap((r) => r.content_gaps.map((note) => ({ id: `${r.id}-${note}`, note })));

  return (
    <PageShell
      title="Competitors"
      description="What the workforce has observed about competing coverage."
      tabs={YOUTUBE_TABS}
      actions={
        <Badge tone={connected ? 'emerald' : 'neutral'}>
          {connected ? 'YouTube connected' : 'YouTube not connected'}
        </Badge>
      }
    >
      {!connected && (
        <p className="mb-4 rounded-lg border border-[var(--color-edge)] bg-white/[0.03] px-3.5 py-2.5 text-[12px] leading-relaxed text-[var(--color-ink-muted)]">
          Channel-level competitor tracking needs the YouTube Data API. Until it is connected,
          this page shows only observations recorded during research — no competitor metrics are
          invented.
        </p>
      )}

      <Section title="Competitor coverage observed during research">
        <Panel className="p-4">
          {observations.length === 0 ? (
            <EmptyState title="Nothing observed yet" />
          ) : (
            <ul className="space-y-1.5">
              {observations.map((item) => (
                <li key={item.id} className="text-[13px] leading-relaxed text-[var(--color-ink-muted)]">
                  • {item.note}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </Section>

      <Section title="Content gaps">
        <Panel className="p-4">
          {gaps.length === 0 ? (
            <EmptyState title="No gaps identified yet" />
          ) : (
            <ul className="space-y-1.5">
              {gaps.map((item) => (
                <li key={item.id} className="text-[13px] leading-relaxed text-[var(--color-ink-muted)]">
                  • {item.note}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </Section>
    </PageShell>
  );
}
