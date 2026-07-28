import { getWorkspace } from '@/lib/db/workspace';
import { PageShell } from '@/components/layout/PageShell';
import { ETSY_TABS } from '@/components/youtube/tabs';
import { NoBusiness } from '@/components/youtube/NoBusiness';
import { OpportunitiesBoard } from '@/components/etsy/OpportunitiesBoard';

export const dynamic = 'force-dynamic';

export default async function EtsyOpportunitiesPage() {
  const { store, business } = await getWorkspace('etsy');
  if (!business) return <NoBusiness tabs={ETSY_TABS} title="Etsy" />;

  const [opportunities, stores] = await Promise.all([
    store.list('etsy_opportunities', {
      where: { business_id: business.id },
      orderBy: { column: 'created_at', ascending: false },
    }),
    store.list('etsy_stores', { where: { business_id: business.id } }),
  ]);

  return (
    <PageShell
      title="Opportunities"
      description="Scored digital product opportunities from the Etsy Researcher."
      tabs={ETSY_TABS}
      wide
    >
      <OpportunitiesBoard
        opportunities={opportunities}
        businessId={business.id}
        defaultNiche={stores[0]?.niche ?? business.description}
      />
    </PageShell>
  );
}
