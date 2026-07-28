import { getWorkspace } from '@/lib/db/workspace';
import { PageShell } from '@/components/layout/PageShell';
import { YOUTUBE_TABS } from '@/components/youtube/tabs';
import { IdeasBoard } from '@/components/youtube/IdeasBoard';
import { NoBusiness } from '@/components/youtube/NoBusiness';

export const dynamic = 'force-dynamic';

export default async function YoutubeIdeasPage() {
  const { store, business } = await getWorkspace('youtube');
  if (!business) return <NoBusiness tabs={YOUTUBE_TABS} title="YouTube" />;

  const [ideas, channels] = await Promise.all([
    store.list('youtube_ideas', {
      where: { business_id: business.id },
      orderBy: { column: 'created_at', ascending: false },
    }),
    store.list('youtube_channels', { where: { business_id: business.id } }),
  ]);
  const channel = channels[0] ?? null;

  return (
    <PageShell
      title="Ideas"
      description="Scored video opportunities from the YouTube Researcher. Approving one starts the research and script pipeline."
      tabs={YOUTUBE_TABS}
      wide
    >
      <IdeasBoard
        ideas={ideas}
        businessId={business.id}
        defaultNiche={channel?.niche ?? business.description}
        defaultAudience={channel?.target_audience ?? ''}
      />
    </PageShell>
  );
}
