import { getWorkspace } from '@/lib/db/workspace';
import { getEtsyProvider } from '@/lib/integrations/platforms';
import { summariseFinance } from '@/lib/finance/calculations';
import { config } from '@/lib/config';
import { formatMoney, formatNumber } from '@/lib/utils';
import { Badge, EmptyState, Panel } from '@/components/ui';
import { PageShell, Section } from '@/components/layout/PageShell';
import { ETSY_TABS } from '@/components/youtube/tabs';
import { NoBusiness } from '@/components/youtube/NoBusiness';

export const dynamic = 'force-dynamic';

export default async function EtsyAnalyticsPage() {
  const { store, ownerId, business } = await getWorkspace('etsy');
  if (!business) return <NoBusiness tabs={ETSY_TABS} title="Etsy" />;

  const [analytics, transactions] = await Promise.all([
    store.list('etsy_analytics', { where: { business_id: business.id } }),
    store.list('financial_transactions', { where: { owner_id: ownerId } }),
  ]);
  const connected = getEtsyProvider().connected;

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const finance = summariseFinance(transactions, {
    businessId: business.id,
    from: monthStart,
    currency: config.currency,
  });

  const totals = analytics.reduce(
    (acc, row) => ({
      visits: acc.visits + row.visits,
      orders: acc.orders + row.orders,
      revenue: acc.revenue + row.revenue,
    }),
    { visits: 0, orders: 0, revenue: 0 },
  );

  return (
    <PageShell
      title="Etsy analytics"
      description="Shop performance. Revenue is taken from recorded transactions; shop traffic requires a live Etsy connection."
      tabs={ETSY_TABS}
      wide
      actions={
        <Badge tone={connected ? 'emerald' : 'neutral'}>
          {connected ? 'Etsy connected' : 'Etsy not connected'}
        </Badge>
      }
    >
      <Section>
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat
            label="Revenue this month"
            value={formatMoney(finance.revenue, config.currency)}
            tone="#34d399"
          />
          <Stat
            label="Recorded visits"
            value={analytics.length > 0 ? formatNumber(totals.visits) : 'Not connected'}
          />
          <Stat
            label="Recorded orders"
            value={analytics.length > 0 ? formatNumber(totals.orders) : 'Not connected'}
          />
        </div>
      </Section>

      {analytics.length === 0 && (
        <Panel>
          <EmptyState
            title="No shop traffic recorded"
            detail="Visit and conversion figures come from the Etsy Open API. Revenue above is real — it comes from recorded transactions — but traffic will stay empty until Etsy is connected."
          />
        </Panel>
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
