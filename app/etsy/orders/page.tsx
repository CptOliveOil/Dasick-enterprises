import { getEtsyProvider } from '@/lib/integrations/platforms';
import { Badge, EmptyState, Panel } from '@/components/ui';
import { PageShell } from '@/components/layout/PageShell';
import { ETSY_TABS } from '@/components/youtube/tabs';

export const dynamic = 'force-dynamic';

/**
 * Orders are real money moving. Without a live Etsy connection there is nothing
 * truthful to show, so this page says so rather than rendering placeholder rows.
 */
export default async function EtsyOrdersPage() {
  const connected = getEtsyProvider().connected;

  return (
    <PageShell
      title="Orders"
      description="Shop orders pulled from Etsy."
      tabs={ETSY_TABS}
      actions={
        <Badge tone={connected ? 'emerald' : 'neutral'}>
          {connected ? 'Etsy connected' : 'Etsy not connected'}
        </Badge>
      }
    >
      <Panel>
        <EmptyState
          title="Etsy is not connected"
          detail="Orders come from the Etsy Open API. Until it is connected there is no order data to show, and this page will not display placeholder figures. Set ETSY_API_KEY and register an adapter in lib/integrations/platforms.ts."
        />
      </Panel>
    </PageShell>
  );
}
