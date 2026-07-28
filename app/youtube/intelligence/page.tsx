import { getWorkspace } from '@/lib/db/workspace';
import { formatRelativeTime } from '@/lib/utils';
import { EmptyState, Panel } from '@/components/ui';
import { PageShell, Section } from '@/components/layout/PageShell';
import { YOUTUBE_TABS } from '@/components/youtube/tabs';
import { NoBusiness } from '@/components/youtube/NoBusiness';

export const dynamic = 'force-dynamic';

/**
 * AI conclusions about the channel, stored separately from the raw analytics
 * they were derived from so the two are never confused.
 */
export default async function ChannelIntelligencePage() {
  const { store, business } = await getWorkspace('youtube');
  if (!business) return <NoBusiness tabs={YOUTUBE_TABS} title="YouTube" />;

  const records = await store.list('youtube_channel_intelligence', {
    where: { business_id: business.id },
    orderBy: { column: 'generated_at', ascending: false },
  });
  const latest = records[0] ?? null;

  return (
    <PageShell
      title="Channel Intelligence"
      description="What the YouTube Analyst has concluded from recorded performance. These are interpretations, held apart from the raw analytics."
      tabs={YOUTUBE_TABS}
      wide
    >
      {!latest ? (
        <Panel>
          <EmptyState
            title="No analysis yet"
            detail="Ask the workforce to analyse channel performance and this will populate."
          />
        </Panel>
      ) : (
        <>
          <p className="mb-4 text-[11px] text-[var(--color-ink-faint)]">
            Generated {formatRelativeTime(latest.generated_at)}
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            <List title="Best topics" items={latest.best_topics} />
            <List title="Best title structures" items={latest.best_title_structures} />
            <List title="Thumbnail patterns" items={latest.thumbnail_patterns} />
            <List title="Retention trends" items={latest.retention_trends} />
            <List title="Best publishing periods" items={latest.best_publishing_periods} />
            <Section title="Ideal duration">
              <Panel className="p-4">
                <p className="text-[20px] font-semibold tracking-tight">{latest.ideal_duration}</p>
              </Panel>
            </Section>
          </div>
        </>
      )}
    </PageShell>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  return (
    <Section title={title}>
      <Panel className="p-4">
        {items.length === 0 ? (
          <p className="text-[13px] text-[var(--color-ink-faint)]">Nothing concluded yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {items.map((item, i) => (
              <li key={i} className="text-[13px] leading-relaxed text-[var(--color-ink-muted)]">
                • {item}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </Section>
  );
}
