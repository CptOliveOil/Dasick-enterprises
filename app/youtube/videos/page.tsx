import Link from 'next/link';
import { getWorkspace } from '@/lib/db/workspace';
import { formatCompact, formatMoneyPrecise, formatRelativeTime } from '@/lib/utils';
import { Badge, DemoNotice, EmptyState, Panel } from '@/components/ui';
import { PageShell, Section } from '@/components/layout/PageShell';
import { YOUTUBE_TABS } from '@/components/youtube/tabs';
import { NoBusiness } from '@/components/youtube/NoBusiness';
import { VIDEO_STATUSES, type VideoStatus } from '@/types/domain';
import { PRODUCTION_STAGE_LABELS } from '@/types/production';

export const dynamic = 'force-dynamic';

const COLUMN_TONE: Partial<Record<VideoStatus, string>> = {
  awaiting_approval: 'text-amber-300',
  blocked: 'text-red-300',
  ready: 'text-emerald-300',
  published: 'text-emerald-300',
  failed: 'text-red-300',
};

/**
 * Pipeline and library. The pipeline is where work sits; the library is
 * everything ever produced, with what it cost.
 */
export default async function YoutubeVideosPage() {
  const { store, business } = await getWorkspace('youtube');
  if (!business) return <NoBusiness tabs={YOUTUBE_TABS} title="YouTube" />;

  const [videos, analytics, assets] = await Promise.all([
    store.list('youtube_videos', {
      where: { business_id: business.id },
      orderBy: { column: 'number', ascending: false },
    }),
    store.list('youtube_analytics', { where: { business_id: business.id } }),
    store.list('media_assets', { where: { business_id: business.id } }),
  ]);

  const viewsFor = (videoId: string) =>
    analytics.filter((a) => a.video_id === videoId).reduce((sum, a) => sum + a.views, 0);

  return (
    <PageShell
      title="Videos"
      description="Every video, where it sits in the pipeline, and what it cost to make."
      tabs={YOUTUBE_TABS}
      wide
    >
      {videos.length === 0 ? (
        <Panel>
          <EmptyState title="No videos yet" detail="Approve an idea to start one." />
        </Panel>
      ) : (
        <>
          <Section title="Pipeline">
            <div className="scroll-thin flex gap-3 overflow-x-auto pb-2">
              {VIDEO_STATUSES.map((status) => {
                const column = videos.filter((v) => v.status === status);
                if (column.length === 0) return null;
                return (
                  <div key={status} className="w-[236px] shrink-0">
                    <p className="mb-2 flex items-center justify-between px-1 text-[11px] font-semibold uppercase tracking-[0.12em]">
                      <span className={COLUMN_TONE[status] ?? 'text-[var(--color-ink-muted)]'}>
                        {status.replace('_', ' ')}
                      </span>
                      <span className="text-[var(--color-ink-faint)]">{column.length}</span>
                    </p>
                    <div className="space-y-2">
                      {column.map((video) => (
                        <Link key={video.id} href={`/youtube/production/${video.id}`}>
                          <div className="rounded-xl border border-[var(--color-edge)] bg-white/[0.025] p-3 transition-colors hover:bg-white/[0.05]">
                            <p className="font-mono text-[10px] text-amber-400">
                              #{String(video.number).padStart(3, '0')}
                            </p>
                            <p className="mt-0.5 text-[13px] leading-snug">{video.title}</p>
                            <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--color-ink-faint)]">
                              <span>{PRODUCTION_STAGE_LABELS[video.stage]}</span>
                              {video.is_demo && <DemoNotice />}
                            </p>
                            {video.blocked_reason && (
                              <p className="mt-1.5 line-clamp-2 text-[11px] leading-snug text-amber-300">
                                {video.blocked_reason}
                              </p>
                            )}
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>

          <Section title={`Library · ${videos.length}`}>
            <Panel className="overflow-hidden">
              <div className="scroll-thin overflow-x-auto">
                <table className="w-full min-w-[860px] text-left">
                  <thead>
                    <tr className="border-b border-[var(--color-edge-soft)]">
                      {['', 'Video', 'Stage', 'Status', 'Cost', 'Views', 'Updated'].map(
                        (header, i) => (
                          <th
                            key={i}
                            scope="col"
                            className="px-3.5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-ink-faint)]"
                          >
                            {header}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {videos.map((video) => {
                      const thumbnail = video.thumbnail_asset_id
                        ? assets.find((a) => a.id === video.thumbnail_asset_id)
                        : null;
                      const views = viewsFor(video.id);
                      return (
                        <tr
                          key={video.id}
                          className="border-b border-[var(--color-edge-soft)] text-[13px] last:border-0 hover:bg-white/[0.03]"
                        >
                          <td className="w-[92px] px-3.5 py-2">
                            {thumbnail ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={`/api/media/${thumbnail.id}`}
                                alt=""
                                className="h-[42px] w-[74px] rounded object-cover"
                              />
                            ) : (
                              <span className="block h-[42px] w-[74px] rounded border border-dashed border-[var(--color-edge)]" />
                            )}
                          </td>
                          <td className="px-3.5 py-2">
                            <Link href={`/youtube/production/${video.id}`} className="block">
                              <span className="font-mono text-[10px] text-amber-400">
                                #{String(video.number).padStart(3, '0')}
                              </span>
                              <span className="ml-2">{video.title}</span>
                            </Link>
                          </td>
                          <td className="px-3.5 py-2 text-[var(--color-ink-muted)]">
                            {PRODUCTION_STAGE_LABELS[video.stage]}
                          </td>
                          <td className="px-3.5 py-2">
                            <Badge
                              tone={
                                video.status === 'published' || video.status === 'ready'
                                  ? 'emerald'
                                  : video.status === 'blocked' || video.status === 'failed'
                                    ? 'red'
                                    : video.status === 'awaiting_approval'
                                      ? 'amber'
                                      : 'neutral'
                              }
                            >
                              {video.status.replace('_', ' ')}
                            </Badge>
                          </td>
                          <td className="px-3.5 py-2 tabular-nums text-[var(--color-ink-muted)]">
                            {formatMoneyPrecise(video.actual_cost)}
                          </td>
                          <td className="px-3.5 py-2 tabular-nums text-[var(--color-ink-muted)]">
                            {views > 0 ? formatCompact(views) : '—'}
                          </td>
                          <td className="px-3.5 py-2 text-[var(--color-ink-faint)]">
                            {formatRelativeTime(video.updated_at)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Panel>
            <p className="mt-2 text-[11px] text-[var(--color-ink-faint)]">
              Views come from recorded analytics. They stay empty until the YouTube Data API is
              connected.
            </p>
          </Section>
        </>
      )}
    </PageShell>
  );
}
