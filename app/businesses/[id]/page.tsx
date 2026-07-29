import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { formatMoneyPrecise } from '@/lib/utils';
import { agentWorkloads } from '@/lib/operations/today';
import { Badge, Panel } from '@/components/ui';
import { PageShell, Section } from '@/components/layout/PageShell';
import { AgentAssignment } from '@/components/businesses/AgentAssignment';

export const dynamic = 'force-dynamic';

/**
 * One business: who works on it, and what that has cost.
 *
 * The distinction the page is built around is core vs shared. A core agent is
 * scoped to this business — its memory stays here, and it is preferred for this
 * business' work. A shared agent has no business and works across all of them.
 * Both genuinely operate on this channel, which is why both are listed.
 */
export default async function BusinessPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { store, ownerId } = await getSession();

  const business = await store.get('businesses', id);
  if (!business || business.owner_id !== ownerId) notFound();

  const [agents, missions, tasks, transactions, approvals] = await Promise.all([
    store.list('agents', { where: { owner_id: ownerId } }),
    store.list('missions', { where: { owner_id: ownerId } }),
    store.list('tasks', { where: { owner_id: ownerId } }),
    store.list('financial_transactions', { where: { owner_id: ownerId } }),
    store.list('approvals', { where: { owner_id: ownerId } }),
  ]);

  const live = agents.filter((agent) => !agent.archived_at);
  const core = live.filter((agent) => agent.business_id === business.id);
  const shared = live.filter((agent) => agent.business_id === null);
  const elsewhere = live.filter(
    (agent) => agent.business_id !== null && agent.business_id !== business.id,
  );

  const workloads = agentWorkloads(live, tasks, transactions);
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const spend = transactions
    .filter(
      (t) =>
        t.business_id === business.id &&
        t.kind !== 'revenue' &&
        new Date(t.occurred_at ?? t.created_at) >= monthStart,
    )
    .reduce((total, t) => total + Math.abs(t.amount), 0);

  const activeMissions = missions.filter(
    (mission) =>
      mission.business_id === business.id &&
      !['completed', 'cancelled'].includes(mission.status),
  );
  const waiting = approvals.filter(
    (approval) => approval.status === 'pending' && approval.business_id === business.id,
  );

  return (
    <PageShell
      title={business.name}
      description={business.description || `${business.kind} · ${business.currency}`}
      wide
      actions={
        <Link
          href={`/${business.slug}`}
          className="text-[12px] text-amber-400 underline-offset-4 hover:underline"
        >
          Open workspace →
        </Link>
      }
    >
      <Section title="This month">
        <Panel className="p-4">
          <dl className="grid gap-4 sm:grid-cols-4">
            <Stat label="Active missions" value={activeMissions.length} />
            <Stat label="Waiting on you" value={waiting.length} />
            <Stat label="Core agents" value={core.length} />
            <Stat label="Costs" value={formatMoneyPrecise(spend, business.currency)} />
          </dl>
        </Panel>
      </Section>

      <Section title={`Core agents · ${core.length}`}>
        <AgentAssignment
          businessId={business.id}
          businessName={business.name}
          agents={core.map((agent) => ({
            id: agent.id,
            name: agent.name,
            slug: agent.slug,
            role: agent.role,
            colour: agent.visual.colour,
            capabilities: agent.capabilities,
            band: workloads.find((entry) => entry.agentId === agent.id)?.band ?? 'idle',
          }))}
          mode="core"
        />
        <p className="mt-2 text-[11px] leading-relaxed text-[var(--color-ink-faint)]">
          Scoped to {business.name}. Their memory stays with this business and never reaches
          another channel&rsquo;s prompt.
        </p>
      </Section>

      <Section title={`Shared agents · ${shared.length}`}>
        <AgentAssignment
          businessId={business.id}
          businessName={business.name}
          agents={shared.map((agent) => ({
            id: agent.id,
            name: agent.name,
            slug: agent.slug,
            role: agent.role,
            colour: agent.visual.colour,
            capabilities: agent.capabilities,
            band: workloads.find((entry) => entry.agentId === agent.id)?.band ?? 'idle',
          }))}
          mode="shared"
        />
        <p className="mt-2 text-[11px] leading-relaxed text-[var(--color-ink-faint)]">
          Available to every business. Assigning one here makes it a specialist for{' '}
          {business.name} and stops other businesses preferring it.
        </p>
      </Section>

      {elsewhere.length > 0 && (
        <Section title="Assigned to other businesses">
          <Panel className="p-4">
            <p className="flex flex-wrap gap-1.5">
              {elsewhere.map((agent) => (
                <Link key={agent.id} href={`/agents/${agent.slug}`}>
                  <span className="rounded-full border border-[var(--color-edge)] bg-white/[0.03] px-2.5 py-1 text-[11px] text-[var(--color-ink-faint)] hover:bg-white/[0.07]">
                    {agent.name}
                  </span>
                </Link>
              ))}
            </p>
            <p className="mt-2 text-[11px] leading-relaxed text-[var(--color-ink-faint)]">
              These belong to another business. They are only ever borrowed when nothing scoped to
              this one — and no shared agent — can do the work.
            </p>
          </Panel>
        </Section>
      )}
    </PageShell>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-[0.1em] text-[var(--color-ink-faint)]">
        {label}
      </dt>
      <dd className="mt-0.5 text-[16px] font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
