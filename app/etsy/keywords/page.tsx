import { getWorkspace } from '@/lib/db/workspace';
import { EmptyState, Panel } from '@/components/ui';
import { PageShell } from '@/components/layout/PageShell';
import { ETSY_TABS } from '@/components/youtube/tabs';
import { NoBusiness } from '@/components/youtube/NoBusiness';

export const dynamic = 'force-dynamic';

export default async function EtsyKeywordsPage() {
  const { store, business } = await getWorkspace('etsy');
  if (!business) return <NoBusiness tabs={ETSY_TABS} title="Etsy" />;

  const keywords = await store.list('etsy_keywords', {
    where: { business_id: business.id },
    orderBy: { column: 'relevance', ascending: false },
  });

  return (
    <PageShell
      title="Keywords"
      description="Search phrases the SEO Agent has researched. Volume is a qualitative band, not a fabricated number — no live keyword source is connected."
      tabs={ETSY_TABS}
      wide
    >
      {keywords.length === 0 ? (
        <Panel>
          <EmptyState
            title="No keywords yet"
            detail="Ask the workforce for keyword research and they will appear here."
          />
        </Panel>
      ) : (
        <Panel className="overflow-hidden">
          <div className="scroll-thin overflow-x-auto">
            <table className="w-full min-w-[520px] text-left">
              <thead>
                <tr className="border-b border-[var(--color-edge-soft)]">
                  {['Keyword', 'Demand', 'Competition', 'Relevance'].map((header) => (
                    <th
                      key={header}
                      scope="col"
                      className="px-3.5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-ink-faint)]"
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {keywords.map((keyword) => (
                  <tr
                    key={keyword.id}
                    className="border-b border-[var(--color-edge-soft)] text-[13px] last:border-0"
                  >
                    <td className="px-3.5 py-2.5">{keyword.keyword}</td>
                    <td className="px-3.5 py-2.5 text-[var(--color-ink-muted)]">
                      {keyword.search_volume}
                    </td>
                    <td className="px-3.5 py-2.5 text-[var(--color-ink-muted)]">
                      {keyword.competition}
                    </td>
                    <td className="px-3.5 py-2.5">
                      <span className="flex items-center gap-2">
                        <span className="h-1.5 w-20 overflow-hidden rounded-full bg-white/[0.08]">
                          <span
                            className="block h-full rounded-full bg-emerald-400"
                            style={{ width: `${keyword.relevance * 100}%` }}
                          />
                        </span>
                        <span className="tabular-nums text-[12px] text-[var(--color-ink-muted)]">
                          {Math.round(keyword.relevance * 100)}%
                        </span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </PageShell>
  );
}
