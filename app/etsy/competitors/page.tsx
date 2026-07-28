import { getWorkspace } from '@/lib/db/workspace';
import { getEtsyProvider } from '@/lib/integrations/platforms';
import { Badge, EmptyState, Panel } from '@/components/ui';
import { PageShell, Section } from '@/components/layout/PageShell';
import { ETSY_TABS } from '@/components/youtube/tabs';
import { NoBusiness } from '@/components/youtube/NoBusiness';

export const dynamic = 'force-dynamic';

export default async function EtsyCompetitorsPage() {
  const { store, business } = await getWorkspace('etsy');
  if (!business) return <NoBusiness tabs={ETSY_TABS} title="Etsy" />;

  const opportunities = await store.list('etsy_opportunities', {
    where: { business_id: business.id },
  });
  const connected = getEtsyProvider().connected;

  return (
    <PageShell
      title="Competitors"
      description="Competitive observations recorded during product research."
      tabs={ETSY_TABS}
      actions={
        <Badge tone={connected ? 'emerald' : 'neutral'}>
          {connected ? 'Etsy connected' : 'Etsy not connected'}
        </Badge>
      }
    >
      {!connected && (
        <p className="mb-4 rounded-lg border border-[var(--color-edge)] bg-white/[0.03] px-3.5 py-2.5 text-[12px] leading-relaxed text-[var(--color-ink-muted)]">
          Shop-level competitor tracking needs the Etsy Open API. This page shows only what
          research has observed — no competitor metrics are invented.
        </p>
      )}

      <Section title="Market gaps observed">
        <Panel className="overflow-hidden">
          {opportunities.length === 0 ? (
            <EmptyState title="Nothing observed yet" />
          ) : (
            <ul>
              {opportunities.map((opportunity) => (
                <li
                  key={opportunity.id}
                  className="border-b border-[var(--color-edge-soft)] px-4 py-3 last:border-0"
                >
                  <p className="text-[13px] font-medium">{opportunity.product}</p>
                  <p className="mt-1 text-[12px] leading-snug text-[var(--color-ink-muted)]">
                    {opportunity.market_gap}
                  </p>
                  <p className="mt-1 text-[11px] text-[var(--color-ink-faint)]">
                    Competition: {opportunity.competition}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </Section>
    </PageShell>
  );
}
