import Link from 'next/link';
import { Plus } from 'lucide-react';
import { getSession } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { config } from '@/lib/config';
import { formatMoney, formatMoneyPrecise } from '@/lib/utils';
import { Badge, Button, EmptyState, Panel } from '@/components/ui';
import { PageShell, Section } from '@/components/layout/PageShell';

export const dynamic = 'force-dynamic';

/**
 * Businesses are the top level of the model: each one is its own system, with
 * its own agents, missions, memory, analytics and budget.
 *
 * Revenue reads `—` rather than £0.00 when nothing has been recorded. A channel
 * with no connected analytics has *unknown* revenue, and showing nought would
 * be a claim we cannot support.
 */
export default async function BusinessesPage() {
  const { store, ownerId, role } = await getSession();
  const [businesses, agents, missions, approvals, transactions] = await Promise.all([
    store.list('businesses', { where: { owner_id: ownerId } }),
    store.list('agents', { where: { owner_id: ownerId } }),
    store.list('missions', { where: { owner_id: ownerId } }),
    store.list('approvals', { where: { owner_id: ownerId } }),
    store.list('financial_transactions', { where: { owner_id: ownerId } }),
  ]);

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const thisMonth = transactions.filter(
    (t) => new Date(t.occurred_at ?? t.created_at) >= monthStart,
  );

  const shared = agents.filter((agent) => agent.business_id === null && !agent.archived_at);

  return (
    <PageShell
      title="Businesses"
      description="Each business is a system in the universe with its own agents, missions, memory and finances."
      wide
      actions={
        can(role, 'settings.manage') ? (
          <Link href="/businesses/new">
            <Button size="sm" variant="primary">
              <Plus className="h-3.5 w-3.5" />
              New business
            </Button>
          </Link>
        ) : undefined
      }
    >
      {businesses.length === 0 ? (
        <Panel>
          <EmptyState
            title="No businesses yet"
            detail="Create one to give your workforce something to work on."
          />
        </Panel>
      ) : (
        <Section title={`Businesses · ${businesses.length}`}>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {businesses.map((business) => {
              const own = agents.filter(
                (agent) => agent.business_id === business.id && !agent.archived_at,
              );
              const active = missions.filter(
                (mission) =>
                  mission.business_id === business.id &&
                  !['completed', 'cancelled'].includes(mission.status),
              );
              const waiting = approvals.filter(
                (approval) =>
                  approval.status === 'pending' && approval.business_id === business.id,
              );
              const sourceGates = waiting.filter((approval) => approval.kind === 'source');

              const rows = thisMonth.filter((t) => t.business_id === business.id);
              const revenueRows = rows.filter((t) => t.kind === 'revenue');
              const costs = rows
                .filter((t) => t.kind !== 'revenue')
                .reduce((total, t) => total + Math.abs(t.amount), 0);

              return (
                <Panel key={business.id} className="p-4">
                  <p className="flex items-start justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        aria-hidden
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{
                          backgroundColor: business.colour,
                          boxShadow: `0 0 8px ${business.colour}`,
                        }}
                      />
                      <span className="min-w-0">
                        <Link
                          href={`/${business.slug}`}
                          className="block truncate text-[14px] font-medium underline-offset-4 hover:underline"
                        >
                          {business.name}
                        </Link>
                        <span className="block text-[11px] text-[var(--color-ink-faint)]">
                          {business.kind} · {business.currency}
                        </span>
                      </span>
                    </span>
                    {business.is_demo && <Badge tone="amber">Demo</Badge>}
                  </p>

                  <p className="mt-2 line-clamp-2 text-[12px] leading-relaxed text-[var(--color-ink-muted)]">
                    {business.description}
                  </p>

                  <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
                    <Metric label="Active missions" value={active.length} />
                    <Metric label="Agents" value={own.length} />
                    <Metric
                      label="Waiting approvals"
                      value={waiting.length}
                      tone={waiting.length > 0 ? '#fbbf24' : undefined}
                    />
                    <Metric
                      label="Needs source"
                      value={sourceGates.length}
                      tone={sourceGates.length > 0 ? '#f87171' : undefined}
                    />
                    <Metric
                      label="Revenue (month)"
                      // No revenue rows means unknown, not nothing.
                      value={
                        revenueRows.length > 0
                          ? formatMoney(
                              revenueRows.reduce((total, t) => total + t.amount, 0),
                              business.currency,
                            )
                          : null
                      }
                      tone={revenueRows.length > 0 ? '#34d399' : undefined}
                    />
                    <Metric
                      label="Costs (month)"
                      value={formatMoneyPrecise(costs, business.currency)}
                    />
                  </dl>

                  <p className="mt-3 flex flex-wrap gap-2">
                    <Link
                      href={`/businesses/${business.id}`}
                      className="text-[12px] text-amber-400 underline-offset-4 hover:underline"
                    >
                      Agents and settings →
                    </Link>
                    <Link
                      href={`/${business.slug}`}
                      className="text-[12px] text-[var(--color-ink-muted)] underline-offset-4 hover:underline"
                    >
                      Open workspace →
                    </Link>
                  </p>
                </Panel>
              );
            })}
          </div>
        </Section>
      )}

      <Section title={`Shared agents · ${shared.length}`}>
        <Panel className="p-4">
          <p className="text-[12px] leading-relaxed text-[var(--color-ink-muted)]">
            Agents with no business work across all of them — the Manager, Finance, and production
            agents not tied to a single channel. A business-scoped agent is a specialist: it is
            preferred for that business and only borrowed by another when nothing else can do the
            work.
          </p>
          {shared.length > 0 && (
            <p className="mt-2.5 flex flex-wrap gap-1.5">
              {shared.map((agent) => (
                <Link key={agent.id} href={`/agents/${agent.slug}`}>
                  <span className="rounded-full border border-[var(--color-edge)] bg-white/[0.03] px-2.5 py-1 text-[11px] text-[var(--color-ink-muted)] hover:bg-white/[0.07]">
                    {agent.name}
                  </span>
                </Link>
              ))}
            </p>
          )}
        </Panel>
      </Section>

      <p className="mt-3 text-[11px] text-[var(--color-ink-faint)]">
        Amounts are in {config.currency} unless a business sets its own currency. Revenue shows
        &ldquo;—&rdquo; where no sales or analytics data has been recorded — that means unknown,
        not zero.
      </p>
    </PageShell>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string | null;
  tone?: string;
}) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-[0.1em] text-[var(--color-ink-faint)]">
        {label}
      </dt>
      <dd
        className="mt-0.5 text-[14px] font-semibold tabular-nums"
        style={tone ? { color: tone } : undefined}
      >
        {value === null ? <span className="text-[var(--color-ink-faint)]">—</span> : value}
      </dd>
    </div>
  );
}
