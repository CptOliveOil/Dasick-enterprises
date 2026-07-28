import { getWorkspace } from '@/lib/db/workspace';
import {
  getImageProvider,
  getVideoProvider,
  getVoiceProvider,
} from '@/lib/integrations/media';
import { Badge, EmptyState, Panel } from '@/components/ui';
import { PageShell, Section } from '@/components/layout/PageShell';
import { YOUTUBE_TABS } from '@/components/youtube/tabs';
import { NoBusiness } from '@/components/youtube/NoBusiness';

export const dynamic = 'force-dynamic';

export default async function YoutubeProductionPage() {
  const { store, business } = await getWorkspace('youtube');
  if (!business) return <NoBusiness tabs={YOUTUBE_TABS} title="YouTube" />;

  const videos = await store.list('youtube_videos', { where: { business_id: business.id } });
  const scenes = await store.list('youtube_scenes');
  const concepts = await store.list('youtube_thumbnail_concepts', {
    where: { business_id: business.id },
  });

  const inProduction = videos.filter((v) =>
    ['production', 'thumbnail', 'awaiting_approval', 'ready'].includes(v.status),
  );

  // Connection state is read from the server, never assumed.
  const providers = [
    { label: 'Voice', connected: getVoiceProvider().connected, env: 'VOICE_PROVIDER_API_KEY' },
    { label: 'Image', connected: getImageProvider().connected, env: 'IMAGE_PROVIDER_API_KEY' },
    { label: 'Video', connected: getVideoProvider().connected, env: 'VIDEO_PROVIDER_API_KEY' },
  ];

  return (
    <PageShell
      title="Production"
      description="Scene-by-scene plans and thumbnail concepts. Assets stay pending until a generation provider actually produces them."
      tabs={YOUTUBE_TABS}
      wide
    >
      <Section title="Generation providers">
        <div className="grid gap-3 sm:grid-cols-3">
          {providers.map((provider) => (
            <Panel key={provider.label} className="p-3.5">
              <p className="flex items-center justify-between text-[13px]">
                {provider.label}
                <Badge tone={provider.connected ? 'emerald' : 'neutral'}>
                  {provider.connected ? 'Connected' : 'Not connected'}
                </Badge>
              </p>
              {!provider.connected && (
                <p className="mt-1.5 text-[11px] leading-snug text-[var(--color-ink-faint)]">
                  Set {provider.env} and register an adapter in lib/integrations/media.ts.
                </p>
              )}
            </Panel>
          ))}
        </div>
      </Section>

      <Section title="Thumbnail concepts">
        {concepts.length === 0 ? (
          <Panel>
            <EmptyState title="No thumbnail concepts yet" />
          </Panel>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {concepts.map((concept) => (
              <Panel key={concept.id} className="p-4">
                <p className="text-[15px] font-semibold tracking-tight">{concept.text}</p>
                <p className="mt-2 text-[12px] leading-snug text-[var(--color-ink-muted)]">
                  {concept.subject}
                </p>
                <dl className="mt-3 space-y-1 border-t border-[var(--color-edge-soft)] pt-3 text-[11px]">
                  <Row label="Composition" value={concept.composition} />
                  <Row label="Emotion" value={concept.emotion} />
                  <Row label="Colour" value={concept.colour_direction} />
                </dl>
                <p className="mt-2.5 text-[11px] leading-snug text-[var(--color-ink-faint)]">
                  {concept.reasoning}
                </p>
              </Panel>
            ))}
          </div>
        )}
      </Section>

      <Section title="Production plans">
        {inProduction.length === 0 ? (
          <Panel>
            <EmptyState
              title="Nothing in production"
              detail="A production plan is created once a script passes its fact check and is approved."
            />
          </Panel>
        ) : (
          inProduction.map((video) => {
            const videoScenes = scenes
              .filter((s) => s.video_id === video.id)
              .sort((a, b) => a.scene_number - b.scene_number);
            return (
              <Panel key={video.id} className="mb-3 overflow-hidden">
                <div className="flex items-center gap-3 border-b border-[var(--color-edge-soft)] px-4 py-3">
                  <span className="font-mono text-[11px] text-amber-400">
                    #{String(video.number).padStart(3, '0')}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[14px]">{video.title}</span>
                  <Badge>{videoScenes.length} scenes</Badge>
                </div>
                {videoScenes.length === 0 ? (
                  <p className="px-4 py-5 text-center text-[13px] text-[var(--color-ink-faint)]">
                    No scene plan generated yet.
                  </p>
                ) : (
                  <ul>
                    {videoScenes.map((scene) => (
                      <li
                        key={scene.id}
                        className="border-b border-[var(--color-edge-soft)] px-4 py-3 last:border-0"
                      >
                        <p className="flex items-center gap-2 text-[11px] text-[var(--color-ink-faint)]">
                          <span className="font-mono">
                            {String(scene.scene_number).padStart(2, '0')}
                          </span>
                          <span>{scene.duration_seconds}s</span>
                          <Badge tone={scene.asset_status === 'ready' ? 'emerald' : 'neutral'}>
                            assets {scene.asset_status}
                          </Badge>
                        </p>
                        <p className="mt-1 text-[13px] leading-snug">{scene.narration}</p>
                        <p className="mt-1 text-[12px] leading-snug text-[var(--color-ink-muted)]">
                          {scene.visual_direction}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            );
          })
        )}
      </Section>
    </PageShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-[76px] shrink-0 text-[var(--color-ink-faint)]">{label}</dt>
      <dd className="min-w-0 flex-1 text-[var(--color-ink-muted)]">{value}</dd>
    </div>
  );
}
