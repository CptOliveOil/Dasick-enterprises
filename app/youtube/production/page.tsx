import Link from 'next/link';
import { getWorkspace } from '@/lib/db/workspace';
import { describeMediaProviders } from '@/lib/integrations/providers/registry';
import { formatMoneyPrecise, formatRelativeTime } from '@/lib/utils';
import { Badge, EmptyState, Panel, ProgressBar } from '@/components/ui';
import { PageShell, Section } from '@/components/layout/PageShell';
import { YOUTUBE_TABS } from '@/components/youtube/tabs';
import { NoBusiness } from '@/components/youtube/NoBusiness';
import { PRODUCTION_STAGE_LABELS } from '@/types/production';

export const dynamic = 'force-dynamic';

/** Everything currently in production, and what each provider can actually do. */
export default async function YoutubeProductionPage() {
  const { store, business } = await getWorkspace('youtube');
  if (!business) return <NoBusiness tabs={YOUTUBE_TABS} title="YouTube" />;

  const [videos, scenes, assets] = await Promise.all([
    store.list('youtube_videos', { where: { business_id: business.id } }),
    store.list('youtube_scenes'),
    store.list('media_assets', { where: { business_id: business.id } }),
  ]);

  const inProduction = videos
    .filter((v) => !['published', 'idea'].includes(v.status))
    .sort((a, b) => b.number - a.number);

  const providers = describeMediaProviders();

  return (
    <PageShell
      title="Production"
      description="Videos moving through the production pipeline, and the providers that make them."
      tabs={YOUTUBE_TABS}
      wide
    >
      <Section title="Providers">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {providers.map((provider) => (
            <Panel key={provider.kind} className="p-3.5">
              <p className="flex items-center justify-between gap-2 text-[13px] capitalize">
                {provider.kind}
                <Badge
                  tone={
                    provider.simulated ? 'amber' : provider.connected ? 'emerald' : 'neutral'
                  }
                >
                  {provider.simulated
                    ? 'Simulated'
                    : provider.connected
                      ? 'Connected'
                      : 'Not connected'}
                </Badge>
              </p>
              <p className="mt-1 truncate text-[11px] text-[var(--color-ink-faint)]">
                {provider.name}
              </p>
              {!provider.connected && provider.requiredEnv.length > 0 && (
                <p className="mt-1.5 text-[10px] leading-snug text-[var(--color-ink-faint)]">
                  Set {provider.requiredEnv.join(', ')}
                </p>
              )}
            </Panel>
          ))}
        </div>
      </Section>

      <Section title={`In production · ${inProduction.length}`}>
        {inProduction.length === 0 ? (
          <Panel>
            <EmptyState
              title="Nothing in production"
              detail="Approve a script and the production pipeline takes over from there."
            />
          </Panel>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {inProduction.map((video) => {
              const videoScenes = scenes.filter((s) => s.video_id === video.id);
              const sourced = videoScenes.filter((s) => s.asset_id).length;
              const thumbnail = video.thumbnail_asset_id
                ? assets.find((a) => a.id === video.thumbnail_asset_id)
                : null;
              const simulated = assets.some((a) => a.video_id === video.id && a.simulated);

              return (
                <Link key={video.id} href={`/youtube/production/${video.id}`}>
                  <Panel className="h-full overflow-hidden transition-colors hover:bg-white/[0.04]">
                    <div className="flex gap-3 p-3.5">
                      {thumbnail ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={`/api/media/${thumbnail.id}`}
                          alt=""
                          className="h-[68px] w-[120px] shrink-0 rounded-lg object-cover"
                        />
                      ) : (
                        <span className="flex h-[68px] w-[120px] shrink-0 items-center justify-center rounded-lg border border-dashed border-[var(--color-edge)] text-[10px] text-[var(--color-ink-faint)]">
                          No thumbnail
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="font-mono text-[10px] text-amber-400">
                          #{String(video.number).padStart(3, '0')}
                        </p>
                        <p className="mt-0.5 truncate text-[13px] font-medium">{video.title}</p>
                        <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                          <Badge
                            tone={
                              video.status === 'blocked'
                                ? 'red'
                                : video.status === 'ready'
                                  ? 'emerald'
                                  : 'sky'
                            }
                          >
                            {PRODUCTION_STAGE_LABELS[video.stage]}
                          </Badge>
                          {simulated && <Badge tone="amber">Simulated</Badge>}
                          <span className="text-[var(--color-ink-faint)]">
                            {formatMoneyPrecise(video.actual_cost)}
                          </span>
                        </p>
                      </div>
                    </div>

                    {videoScenes.length > 0 && (
                      <div className="px-3.5 pb-3">
                        <ProgressBar
                          value={(sourced / videoScenes.length) * 100}
                          colour="#34d399"
                          label="Scenes sourced"
                        />
                        <p className="mt-1 text-[10px] text-[var(--color-ink-faint)]">
                          {sourced} / {videoScenes.length} scenes sourced · updated{' '}
                          {formatRelativeTime(video.updated_at)}
                        </p>
                      </div>
                    )}

                    {video.blocked_reason && (
                      <p className="border-t border-amber-500/20 bg-amber-500/[0.06] px-3.5 py-2 text-[11px] leading-snug text-amber-200/80">
                        {video.blocked_reason}
                      </p>
                    )}
                  </Panel>
                </Link>
              );
            })}
          </div>
        )}
      </Section>
    </PageShell>
  );
}
