import Link from 'next/link';
import { getStore } from '@/lib/db';
import { summariseFinance } from '@/lib/finance/calculations';
import { config } from '@/lib/config';
import { formatMoney } from '@/lib/utils';
import { agentStatusStyle } from '@/lib/agents/status';
import { Badge, EmptyState, Panel } from '@/components/ui';
import { PageShell } from '@/components/layout/PageShell';

export const dynamic = 'force-dynamic';

/**
 * Businesses are the top level of the model: each one can become its own solar
 * system, with its own agents, workflows and finances.
 */
export default async function BusinessesPage() {
  const { store, ownerId } = await getStore();
  const [businesses, agents, missions, transactions] = await Promise.all([
    store.list('businesses', { where: { owner_id: ownerId } }),
    store.list('agents', { where: { owner_id: ownerId } }),
    store.list('missions', { where: { owner_id: ownerId } }),
    store.list('financial_transactions', { where: { owner_id: ownerId } }),
  ]);

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const global = agents.filter((a) => a.business_id === null);

  return (
    <PageShell
      title="Businesses"
      description="Each business is a system in the universe with its own agents, missions and finances. Adding one does not require code changes."
      wide
    >
      {businesses.length === 0 ? (
        <Panel>
          <EmptyState title="No businesses yet" />
        </Panel>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {businesses.map((business) => {
            const businessAgents = agents.filter((a) => a.business_id === business.id);
            const businessMissions = missions.filter((m) => m.business_id === business.id);
            const finance = summariseFinance(transactions, {
              businessId: business.id,
              from: monthStart,
              currency: config.currency,
            });
            return (
              <Link key={business.id} href={`/${business.slug}`}>
                <Panel className="h-full p-4 transition-colors hover:bg-white/[0.04]">
                  <header className="flex items-start gap-3">
                    <span
                      className="mt-1 h-8 w-8 shrink-0 rounded-full"
                      style={{
                        background: `radial-gradient(circle at 32% 30%, ${business.colour}dd, ${business.colour}55 60%, #05070f)`,
                        boxShadow: `0 0 20px ${business.colour}44`,
                      }}
                    />
                    <div className="min-w-0 flex-1">
                      <h2 className="text-[15px] font-semibold">{business.name}</h2>
                      <p className="mt-0.5 text-[12px] leading-snug text-[var(--color-ink-muted)]">
                        {business.description}
                      </p>
                    </div>
                    {business.is_demo && <Badge tone="amber">Demo</Badge>}
                  </header>

                  <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-[var(--color-edge-soft)] pt-3">
                    <Figure label="Agents" value={businessAgents.length} />
                    <Figure
                      label="Active missions"
                      value={
                        businessMissions.filter(
                          (m) => !['completed', 'cancelled', 'failed'].includes(m.status),
                        ).length
                      }
                    />
                    <Figure
                      label="Profit (month)"
                      value={formatMoney(finance.profit, config.currency)}
                      tone={finance.profit >= 0 ? '#34d399' : '#f87171'}
                    />
                  </dl>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {businessAgents.map((agent) => (
                      <span
                        key={agent.id}
                        className="flex items-center gap-1.5 rounded-full bg-white/[0.05] px-2 py-0.5 text-[11px]"
                        title={agentStatusStyle(agent.status).label}
                      >
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: agentStatusStyle(agent.status).colour }}
                        />
                        {agent.name}
                      </span>
                    ))}
                  </div>
                </Panel>
              </Link>
            );
          })}
        </div>
      )}

      {global.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-ink-muted)]">
            Agents that work across every business
          </h2>
          <Panel className="p-4">
            <div className="flex flex-wrap gap-1.5">
              {global.map((agent) => (
                <Link
                  key={agent.id}
                  href={`/agents/${agent.slug}`}
                  className="flex items-center gap-1.5 rounded-full bg-white/[0.05] px-2.5 py-1 text-[12px] hover:bg-white/[0.09]"
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: agentStatusStyle(agent.status).colour }}
                  />
                  {agent.name}
                </Link>
              ))}
            </div>
          </Panel>
        </div>
      )}
    </PageShell>
  );
}

function Figure({
  label,
  value,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  tone?: string;
}) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-[0.1em] text-[var(--color-ink-faint)]">
        {label}
      </dt>
      <dd className="mt-0.5 text-[15px] font-semibold" style={tone ? { color: tone } : undefined}>
        {value}
      </dd>
    </div>
  );
}
