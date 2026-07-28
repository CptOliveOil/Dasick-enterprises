import { getWorkspace } from '@/lib/db/workspace';
import { formatRelativeTime } from '@/lib/utils';
import { DemoNotice, EmptyState, Panel } from '@/components/ui';
import { PageShell } from '@/components/layout/PageShell';
import { YOUTUBE_TABS } from '@/components/youtube/tabs';
import { NoBusiness } from '@/components/youtube/NoBusiness';
import { VIDEO_STATUSES, type VideoStatus } from '@/types/domain';

export const dynamic = 'force-dynamic';

const COLUMN_TONE: Partial<Record<VideoStatus, string>> = {
  awaiting_approval: 'text-amber-300',
  ready: 'text-emerald-300',
  published: 'text-emerald-300',
  failed: 'text-red-300',
};

/** The conventional pipeline view. The galaxy is primary; this is the board. */
export default async function YoutubeVideosPage() {
  const { store, business } = await getWorkspace('youtube');
  if (!business) return <NoBusiness tabs={YOUTUBE_TABS} title="YouTube" />;

  const videos = await store.list('youtube_videos', {
    where: { business_id: business.id },
    orderBy: { column: 'number', ascending: false },
  });

  return (
    <PageShell
      title="Videos"
      description="Every video and where it is in the pipeline."
      tabs={YOUTUBE_TABS}
      wide
    >
      {videos.length === 0 ? (
        <Panel>
          <EmptyState title="No videos yet" detail="Approve an idea to start one." />
        </Panel>
      ) : (
        <div className="scroll-thin flex gap-3 overflow-x-auto pb-2">
          {VIDEO_STATUSES.map((status) => {
            const column = videos.filter((v) => v.status === status);
            if (column.length === 0) return null;
            return (
              <div key={status} className="w-[248px] shrink-0">
                <p className="mb-2 flex items-center justify-between px-1 text-[11px] font-semibold uppercase tracking-[0.12em]">
                  <span className={COLUMN_TONE[status] ?? 'text-[var(--color-ink-muted)]'}>
                    {status.replace('_', ' ')}
                  </span>
                  <span className="text-[var(--color-ink-faint)]">{column.length}</span>
                </p>
                <div className="space-y-2">
                  {column.map((video) => (
                    <div
                      key={video.id}
                      className="rounded-xl border border-[var(--color-edge)] bg-white/[0.025] p-3"
                    >
                      <p className="font-mono text-[10px] text-amber-400">
                        #{String(video.number).padStart(3, '0')}
                      </p>
                      <p className="mt-0.5 text-[13px] leading-snug">{video.title}</p>
                      <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-[var(--color-ink-faint)]">
                        <span>
                          {video.publish_at
                            ? `Published ${formatRelativeTime(video.publish_at)}`
                            : `Updated ${formatRelativeTime(video.updated_at)}`}
                        </span>
                        {video.is_demo && <DemoNotice />}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
