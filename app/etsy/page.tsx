import Link from 'next/link';
import { getWorkspace } from '@/lib/db/workspace';
import { summariseFinance } from '@/lib/finance/calculations';
import { config } from '@/lib/config';
import { formatMoney } from '@/lib/utils';
import { Badge, Panel, PanelHeader } from '@/components/ui';
import { PageShell, ScoreBar, Section } from '@/components/layout/PageShell';
import { ETSY_TABS } from '@/components/youtube/tabs';
import { NoBusiness } from '@/components/youtube/NoBusiness';
import { ETSY_PRODUCT_STATUSES } from '@/types/domain';

export const dynamic = 'force-dynamic';

export default async function EtsyOverviewPage() {
  const { store, ownerId, business } = await getWorkspace('etsy');
  if (!business) return <NoBusiness tabs={ETSY_TABS} title="Etsy" />;

  const [opportunities, products, listings, transactions, stores] = await Promise.all([
    store.list('etsy_opportunities', { where: { business_id: business.id } }),
    store.list('etsy_products', { where: { business_id: business.id } }),
    store.list('etsy_listings', { where: { business_id: business.id } }),
    store.list('financial_transactions', { where: { owner_id: ownerId } }),
    store.list('etsy_stores', { where: { business_id: business.id } }),
  ]);

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const finance = summariseFinance(transactions, {
    businessId: business.id,
    from: monthStart,
    currency: config.currency,
  });
  const shop = stores[0] ?? null;

  return (
    <PageShell
      title="Etsy"
      description={shop ? `${shop.name} — ${shop.niche}` : business.description}
      tabs={ETSY_TABS}
      wide
    >
      <Section>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Products" value={products.length} />
          <Stat
            label="Awaiting approval"
            value={products.filter((p) => p.status === 'awaiting_approval').length}
            tone="#fbbf24"
          />
          <Stat
            label="Opportunities to review"
            value={opportunities.filter((o) => o.status === 'proposed').length}
          />
          <Stat
            label="Revenue this month"
            value={formatMoney(finance.revenue, config.currency)}
            tone="#34d399"
          />
        </div>
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Product pipeline">
          <Panel className="p-4">
            <ul className="space-y-1.5">
              {ETSY_PRODUCT_STATUSES.map((status) => {
                const count = products.filter((p) => p.status === status).length;
                if (count === 0) return null;
                return (
                  <li key={status} className="flex items-center gap-3 text-[13px]">
                    <span className="w-[150px] shrink-0 capitalize text-[var(--color-ink-muted)]">
                      {status.replace('_', ' ')}
                    </span>
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.07]">
                      <span
                        className="block h-full rounded-full bg-emerald-400"
                        style={{ width: `${(count / Math.max(1, products.length)) * 100}%` }}
                      />
                    </span>
                    <span className="w-6 shrink-0 text-right tabular-nums">{count}</span>
                  </li>
                );
              })}
              {products.length === 0 && (
                <li className="py-4 text-center text-[13px] text-[var(--color-ink-faint)]">
                  No products yet.
                </li>
              )}
            </ul>
            <Link
              href="/etsy/products"
              className="mt-3 inline-block text-[12px] text-amber-400 underline-offset-4 hover:underline"
            >
              Open products →
            </Link>
          </Panel>
        </Section>

        <Section title="Top opportunities">
          <Panel className="overflow-hidden">
            <PanelHeader
              title="Highest scoring"
              action={
                <Link
                  href="/etsy/opportunities"
                  className="text-[11px] text-[var(--color-ink-muted)]"
                >
                  All →
                </Link>
              }
            />
            <ul>
              {[...opportunities]
                .sort((a, b) => b.score - a.score)
                .slice(0, 5)
                .map((opportunity) => (
                  <li
                    key={opportunity.id}
                    className="flex items-center gap-3 border-b border-[var(--color-edge-soft)] px-4 py-2.5 last:border-0"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px]">{opportunity.product}</span>
                      <span className="text-[11px] text-[var(--color-ink-faint)]">
                        {opportunity.status}
                      </span>
                    </span>
                    <ScoreBar score={opportunity.score} />
                  </li>
                ))}
              {opportunities.length === 0 && (
                <li className="px-4 py-6 text-center text-[13px] text-[var(--color-ink-faint)]">
                  No opportunities yet.
                </li>
              )}
            </ul>
          </Panel>
        </Section>
      </div>

      <Section title="Listings">
        <Panel className="overflow-hidden">
          <ul>
            {listings.map((listing) => (
              <li
                key={listing.id}
                className="flex items-center gap-3 border-b border-[var(--color-edge-soft)] px-4 py-2.5 last:border-0"
              >
                <span className="min-w-0 flex-1 truncate text-[13px]">{listing.title}</span>
                <Badge
                  tone={
                    listing.status === 'published'
                      ? 'emerald'
                      : listing.status === 'awaiting_approval'
                        ? 'amber'
                        : 'neutral'
                  }
                >
                  {listing.status.replace('_', ' ')}
                </Badge>
              </li>
            ))}
            {listings.length === 0 && (
              <li className="px-4 py-6 text-center text-[13px] text-[var(--color-ink-faint)]">
                No listings drafted yet.
              </li>
            )}
          </ul>
        </Panel>
      </Section>
    </PageShell>
  );
}

function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <Panel className="p-4">
      <p className="text-[11px] uppercase tracking-[0.1em] text-[var(--color-ink-faint)]">
        {label}
      </p>
      <p
        className="mt-1 text-[24px] font-semibold tracking-tight"
        style={tone ? { color: tone } : undefined}
      >
        {value}
      </p>
    </Panel>
  );
}
