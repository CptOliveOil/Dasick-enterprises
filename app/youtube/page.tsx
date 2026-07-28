import Link from 'next/link';
import { getWorkspace } from '@/lib/db/workspace';
import { summariseFinance } from '@/lib/finance/calculations';
import { config } from '@/lib/config';
import { formatCompact, formatMoney, formatRelativeTime } from '@/lib/utils';
import { Badge, Panel, PanelHeader } from '@/components/ui';
import { PageShell, ScoreBar, Section } from '@/components/layout/PageShell';
import { YOUTUBE_TABS } from '@/components/youtube/tabs';
import { NoBusiness } from '@/components/youtube/NoBusiness';
import { VIDEO_STATUSES } from '@/types/domain';

export const dynamic = 'force-dynamic';

export default async function YoutubeOverviewPage() {
  const { store, ownerId, business } = await getWorkspace('youtube');
  if (!business) return <NoBusiness tabs={YOUTUBE_TABS} title="YouTube" />;

  const [videos, ideas, scripts, analytics, transactions, channels] = await Promise.all([
    store.list('youtube_videos', { where: { business_id: business.id } }),
    store.list('youtube_ideas', { where: { business_id: business.id } }),
    store.list('youtube_scripts', { where: { business_id: business.id } }),
    store.list('youtube_analytics', { where: { business_id: business.id } }),
    store.list('financial_transactions', { where: { owner_id: ownerId } }),
    store.list('youtube_channels', { where: { business_id: business.id } }),
  ]);

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const finance = summariseFinance(transactions, {
    businessId: business.id,
    from: monthStart,
    currency: config.currency,
  });

  const totalViews = analytics.reduce((sum, a) => sum + a.views, 0);
  const averageCtr =
    analytics.length > 0
      ? analytics.reduce((sum, a) => sum + a.ctr, 0) / analytics.length
      : 0;
  const inPipeline = videos.filter((v) => v.status !== 'published').length;
  const channel = channels[0] ?? null;

  return (
    <PageShell
      title="YouTube"
      description={
        channel
          ? `${channel.name} (${channel.handle}) — ${channel.niche}`
          : business.description
      }
      tabs={YOUTUBE_TABS}
      wide
    >
      <Section>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Videos in pipeline" value={inPipeline} />
          <Stat label="Ideas awaiting review" value={ideas.filter((i) => i.status === 'proposed').length} />
          <Stat label="Recorded views" value={formatCompact(totalViews)} tone="#38bdf8" />
          <Stat
            label="Revenue this month"
            value={formatMoney(finance.revenue, config.currency)}
            tone="#34d399"
          />
        </div>
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Pipeline">
          <Panel className="p-4">
            <ul className="space-y-1.5">
              {VIDEO_STATUSES.map((status) => {
                const count = videos.filter((v) => v.status === status).length;
                if (count === 0) return null;
                return (
                  <li key={status} className="flex items-center gap-3 text-[13px]">
                    <span className="w-[150px] shrink-0 capitalize text-[var(--color-ink-muted)]">
                      {status.replace('_', ' ')}
                    </span>
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.07]">
                      <span
                        className="block h-full rounded-full bg-sky-400"
                        style={{ width: `${(count / Math.max(1, videos.length)) * 100}%` }}
                      />
                    </span>
                    <span className="w-6 shrink-0 text-right tabular-nums">{count}</span>
                  </li>
                );
              })}
              {videos.length === 0 && (
                <li className="py-4 text-center text-[13px] text-[var(--color-ink-faint)]">
                  No videos yet.
                </li>
              )}
            </ul>
            <Link
              href="/youtube/videos"
              className="mt-3 inline-block text-[12px] text-amber-400 underline-offset-4 hover:underline"
            >
              Open the pipeline →
            </Link>
          </Panel>
        </Section>

        <Section title="Top opportunities">
          <Panel className="overflow-hidden">
            <PanelHeader
              title="Highest scoring ideas"
              action={
                <Link href="/youtube/ideas" className="text-[11px] text-[var(--color-ink-muted)]">
                  All →
                </Link>
              }
            />
            <ul>
              {[...ideas]
                .sort((a, b) => b.score - a.score)
                .slice(0, 5)
                .map((idea) => (
                  <li
                    key={idea.id}
                    className="flex items-center gap-3 border-b border-[var(--color-edge-soft)] px-4 py-2.5 last:border-0"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px]">{idea.title}</span>
                      <span className="text-[11px] text-[var(--color-ink-faint)]">
                        {idea.status}
                      </span>
                    </span>
                    <ScoreBar score={idea.score} />
                  </li>
                ))}
              {ideas.length === 0 && (
                <li className="px-4 py-6 text-center text-[13px] text-[var(--color-ink-faint)]">
                  No ideas yet.
                </li>
              )}
            </ul>
          </Panel>
        </Section>
      </div>

      <Section title="Scripts">
        <Panel className="overflow-hidden">
          <ul>
            {scripts.slice(0, 6).map((script) => (
              <li
                key={script.id}
                className="flex items-center gap-3 border-b border-[var(--color-edge-soft)] px-4 py-2.5 last:border-0"
              >
                <Link href={`/youtube/scripts/${script.id}`} className="min-w-0 flex-1">
                  <span className="block truncate text-[13px]">{script.title}</span>
                  <span className="text-[11px] text-[var(--color-ink-faint)]">
                    {script.word_count.toLocaleString('en-GB')} words · ~
                    {Math.round(script.estimated_duration_seconds / 60)} min · updated{' '}
                    {formatRelativeTime(script.updated_at)}
                  </span>
                </Link>
                <Badge
                  tone={
                    script.status === 'approved'
                      ? 'emerald'
                      : script.status === 'awaiting_approval'
                        ? 'amber'
                        : 'neutral'
                  }
                >
                  {script.status.replace('_', ' ')}
                </Badge>
              </li>
            ))}
            {scripts.length === 0 && (
              <li className="px-4 py-6 text-center text-[13px] text-[var(--color-ink-faint)]">
                No scripts yet. Approve an idea to start one.
              </li>
            )}
          </ul>
        </Panel>
      </Section>

      <p className="text-[11px] text-[var(--color-ink-faint)]">
        Average recorded CTR {averageCtr.toFixed(2)}% across {analytics.length} rows. Analytics
        are read from recorded data — connect the YouTube Data API in Settings to pull live
        figures.
      </p>
    </PageShell>
  );
}

function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <Panel className="p-4">
      <p className="text-[11px] uppercase tracking-[0.1em] text-[var(--color-ink-faint)]">
        {label}
      </p>
      <p className="mt-1 text-[24px] font-semibold tracking-tight" style={tone ? { color: tone } : undefined}>
        {value}
      </p>
    </Panel>
  );
}
