import { getWorkspace } from '@/lib/db/workspace';
import { getYoutubeProvider } from '@/lib/integrations/platforms';
import { formatCompact, formatMoney, formatNumber } from '@/lib/utils';
import { Badge, EmptyState, Panel, Sparkline } from '@/components/ui';
import { PageShell, Section } from '@/components/layout/PageShell';
import { YOUTUBE_TABS } from '@/components/youtube/tabs';
import { NoBusiness } from '@/components/youtube/NoBusiness';

export const dynamic = 'force-dynamic';

export default async function YoutubeAnalyticsPage() {
  const { store, business } = await getWorkspace('youtube');
  if (!business) return <NoBusiness tabs={YOUTUBE_TABS} title="YouTube" />;

  const [analytics, videos] = await Promise.all([
    store.list('youtube_analytics', { where: { business_id: business.id } }),
    store.list('youtube_videos', { where: { business_id: business.id } }),
  ]);

  const connected = getYoutubeProvider().connected;
  const titleFor = (id: string | null) =>
    videos.find((v) => v.id === id)?.title ?? 'Unknown video';

  const rows = [...analytics].sort((a, b) => b.date.localeCompare(a.date));
  const totals = analytics.reduce(
    (acc, a) => ({
      views: acc.views + a.views,
      impressions: acc.impressions + a.impressions,
      watch: acc.watch + a.watch_time_minutes,
      subs: acc.subs + a.subscribers_gained,
      revenue: acc.revenue + a.revenue,
    }),
    { views: 0, impressions: 0, watch: 0, subs: 0, revenue: 0 },
  );
  const averageCtr =
    analytics.length > 0 ? analytics.reduce((s, a) => s + a.ctr, 0) / analytics.length : 0;

  return (
    <PageShell
      title="Analytics"
      description="Recorded channel performance. Nothing here is estimated — it is the analytics rows the workforce has stored."
      tabs={YOUTUBE_TABS}
      wide
      actions={
        <Badge tone={connected ? 'emerald' : 'neutral'}>
          {connected ? 'YouTube connected' : 'YouTube not connected'}
        </Badge>
      }
    >
      {!connected && (
        <p className="mb-4 rounded-lg border border-[var(--color-edge)] bg-white/[0.03] px-3.5 py-2.5 text-[12px] leading-relaxed text-[var(--color-ink-muted)]">
          The YouTube Data API is not connected, so nothing on this page is live. Set{' '}
          <code className="font-mono text-[11px] text-amber-300">YOUTUBE_API_KEY</code> and
          register an adapter in <code className="font-mono text-[11px]">lib/integrations/platforms.ts</code>{' '}
          to pull real figures.
        </p>
      )}

      {analytics.length === 0 ? (
        <Panel>
          <EmptyState title="No analytics recorded" />
        </Panel>
      ) : (
        <>
          <Section>
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <Stat label="Views" value={formatCompact(totals.views)} tone="#38bdf8" />
              <Stat label="Impressions" value={formatCompact(totals.impressions)} />
              <Stat label="Average CTR" value={`${averageCtr.toFixed(2)}%`} tone="#fbbf24" />
              <Stat label="Subscribers gained" value={formatNumber(totals.subs)} tone="#34d399" />
              <Stat label="Revenue" value={formatMoney(totals.revenue)} tone="#34d399" />
            </div>
          </Section>

          <Section title="Views by video">
            <Panel className="p-4">
              <Sparkline
                points={[...rows].reverse().map((r) => r.views)}
                colour="#38bdf8"
                height={56}
              />
            </Panel>
          </Section>

          <Section title="Per video">
            <Panel className="overflow-hidden">
              <div className="scroll-thin overflow-x-auto">
                <table className="w-full min-w-[820px] text-left">
                  <thead>
                    <tr className="border-b border-[var(--color-edge-soft)]">
                      {[
                        'Video',
                        'Date',
                        'Views',
                        'CTR',
                        'Avg view',
                        'Watch time',
                        'Subs',
                        'Revenue',
                      ].map((header) => (
                        <th
                          key={header}
                          scope="col"
                          className="px-3.5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-ink-faint)]"
                        >
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr
                        key={row.id}
                        className="border-b border-[var(--color-edge-soft)] text-[13px] last:border-0"
                      >
                        <td className="max-w-[280px] truncate px-3.5 py-2.5">
                          {titleFor(row.video_id)}
                        </td>
                        <td className="px-3.5 py-2.5 text-[var(--color-ink-faint)]">{row.date}</td>
                        <td className="px-3.5 py-2.5 tabular-nums">{formatNumber(row.views)}</td>
                        <td className="px-3.5 py-2.5 tabular-nums">{row.ctr}%</td>
                        <td className="px-3.5 py-2.5 tabular-nums text-[var(--color-ink-muted)]">
                          {Math.floor(row.average_view_duration_seconds / 60)}m{' '}
                          {row.average_view_duration_seconds % 60}s
                        </td>
                        <td className="px-3.5 py-2.5 tabular-nums text-[var(--color-ink-muted)]">
                          {formatCompact(row.watch_time_minutes)} min
                        </td>
                        <td className="px-3.5 py-2.5 tabular-nums">{row.subscribers_gained}</td>
                        <td className="px-3.5 py-2.5 tabular-nums text-emerald-300">
                          {formatMoney(row.revenue)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          </Section>
        </>
      )}
    </PageShell>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <Panel className="p-4">
      <p className="text-[11px] uppercase tracking-[0.1em] text-[var(--color-ink-faint)]">
        {label}
      </p>
      <p
        className="mt-1 text-[22px] font-semibold tracking-tight"
        style={tone ? { color: tone } : undefined}
      >
        {value}
      </p>
    </Panel>
  );
}
