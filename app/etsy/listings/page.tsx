import { getWorkspace } from '@/lib/db/workspace';
import { getEtsyProvider } from '@/lib/integrations/platforms';
import { formatMoney } from '@/lib/utils';
import { Badge, EmptyState, Panel } from '@/components/ui';
import { PageShell, Section } from '@/components/layout/PageShell';
import { ETSY_TABS } from '@/components/youtube/tabs';
import { NoBusiness } from '@/components/youtube/NoBusiness';

export const dynamic = 'force-dynamic';

export default async function EtsyListingsPage() {
  const { store, business } = await getWorkspace('etsy');
  if (!business) return <NoBusiness tabs={ETSY_TABS} title="Etsy" />;

  const listings = await store.list('etsy_listings', {
    where: { business_id: business.id },
    orderBy: { column: 'created_at', ascending: false },
  });
  const connected = getEtsyProvider().connected;

  return (
    <PageShell
      title="Listings"
      description="Optimised listing copy drafted by the Listing Agent. Publishing is a separate, gated action."
      tabs={ETSY_TABS}
      wide
      actions={
        <Badge tone={connected ? 'emerald' : 'neutral'}>
          {connected ? 'Etsy connected' : 'Etsy not connected'}
        </Badge>
      }
    >
      {!connected && (
        <p className="mb-4 rounded-lg border border-[var(--color-edge)] bg-white/[0.03] px-3.5 py-2.5 text-[12px] leading-relaxed text-[var(--color-ink-muted)]">
          Etsy is not connected, so nothing can be published from here even after approval. Set{' '}
          <code className="font-mono text-[11px] text-amber-300">ETSY_API_KEY</code> and register
          an adapter in <code className="font-mono text-[11px]">lib/integrations/platforms.ts</code>.
        </p>
      )}

      {listings.length === 0 ? (
        <Panel>
          <EmptyState title="No listings drafted yet" />
        </Panel>
      ) : (
        listings.map((listing) => (
          <Section key={listing.id}>
            <Panel className="p-4">
              <header className="flex flex-wrap items-start justify-between gap-2">
                <h2 className="min-w-0 flex-1 text-[14px] font-medium leading-snug">
                  {listing.title}
                </h2>
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
              </header>

              <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--color-ink-muted)]">
                {listing.description}
              </p>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {listing.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] text-[var(--color-ink-muted)]"
                  >
                    {tag}
                  </span>
                ))}
              </div>

              <div className="mt-4 grid gap-4 border-t border-[var(--color-edge-soft)] pt-3 md:grid-cols-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.1em] text-[var(--color-ink-faint)]">
                    Suggested price
                  </p>
                  <p className="mt-0.5 text-[15px] font-semibold">
                    {formatMoney(listing.price_suggestion)}
                  </p>
                </div>
                <div className="md:col-span-2">
                  <p className="text-[10px] uppercase tracking-[0.1em] text-[var(--color-ink-faint)]">
                    Image brief
                  </p>
                  <p className="mt-0.5 text-[12px] leading-snug text-[var(--color-ink-muted)]">
                    {listing.image_brief}
                  </p>
                </div>
              </div>

              {listing.benefits.length > 0 && (
                <ul className="mt-3 space-y-1">
                  {listing.benefits.map((benefit, i) => (
                    <li key={i} className="text-[12px] text-[var(--color-ink-muted)]">
                      • {benefit}
                    </li>
                  ))}
                </ul>
              )}

              {listing.faq.length > 0 && (
                <dl className="mt-3 space-y-2 border-t border-[var(--color-edge-soft)] pt-3">
                  {listing.faq.map((entry, i) => (
                    <div key={i}>
                      <dt className="text-[12px] font-medium">{entry.question}</dt>
                      <dd className="text-[12px] text-[var(--color-ink-muted)]">{entry.answer}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </Panel>
          </Section>
        ))
      )}
    </PageShell>
  );
}
