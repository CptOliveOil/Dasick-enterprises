import { getWorkspace } from '@/lib/db/workspace';
import { formatMoney, formatRelativeTime } from '@/lib/utils';
import { Badge, DemoNotice, EmptyState, Panel, ProgressBar } from '@/components/ui';
import { PageShell } from '@/components/layout/PageShell';
import { ETSY_TABS } from '@/components/youtube/tabs';
import { NoBusiness } from '@/components/youtube/NoBusiness';
import type { EtsyProductStatus } from '@/types/domain';

export const dynamic = 'force-dynamic';

const STATUS_TONE: Record<EtsyProductStatus, 'neutral' | 'amber' | 'emerald'> = {
  idea: 'neutral',
  research: 'neutral',
  creating: 'neutral',
  listing: 'neutral',
  awaiting_approval: 'amber',
  ready: 'emerald',
  published: 'emerald',
};

export default async function EtsyProductsPage() {
  const { store, business } = await getWorkspace('etsy');
  if (!business) return <NoBusiness tabs={ETSY_TABS} title="Etsy" />;

  const products = await store.list('etsy_products', {
    where: { business_id: business.id },
    orderBy: { column: 'updated_at', ascending: false },
  });

  return (
    <PageShell
      title="Products"
      description="Approved opportunities become products with a production checklist. Nothing is published without an approval."
      tabs={ETSY_TABS}
      wide
    >
      {products.length === 0 ? (
        <Panel>
          <EmptyState
            title="No products yet"
            detail="Approve an opportunity to turn it into a product."
          />
        </Panel>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {products.map((product) => {
            const done = product.production_checklist.filter((c) => c.done).length;
            const total = Math.max(1, product.production_checklist.length);
            return (
              <Panel key={product.id} className="p-4">
                <header className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <h2 className="text-[14px] font-medium leading-snug">{product.name}</h2>
                    <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--color-ink-faint)]">
                      <Badge tone={STATUS_TONE[product.status]}>
                        {product.status.replace('_', ' ')}
                      </Badge>
                      <span>{formatMoney(product.price)}</span>
                      <span>· updated {formatRelativeTime(product.updated_at)}</span>
                      {product.is_demo && <DemoNotice />}
                    </p>
                  </div>
                </header>

                <p className="mt-2.5 text-[13px] leading-relaxed text-[var(--color-ink-muted)]">
                  {product.description}
                </p>

                <div className="mt-3">
                  <div className="mb-1.5 flex items-center justify-between text-[11px] text-[var(--color-ink-faint)]">
                    <span>Production</span>
                    <span>
                      {done} / {product.production_checklist.length}
                    </span>
                  </div>
                  <ProgressBar
                    value={(done / total) * 100}
                    colour="#34d399"
                    label="Production progress"
                  />
                  <ul className="mt-2 space-y-1">
                    {product.production_checklist.map((item, i) => (
                      <li
                        key={i}
                        className={`flex items-center gap-2 text-[12px] ${
                          item.done ? 'text-[var(--color-ink-faint)] line-through' : ''
                        }`}
                      >
                        <span
                          className={`h-3 w-3 shrink-0 rounded border ${
                            item.done
                              ? 'border-emerald-400 bg-emerald-400/25'
                              : 'border-[var(--color-edge)]'
                          }`}
                        />
                        {item.item}
                      </li>
                    ))}
                  </ul>
                </div>
              </Panel>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
