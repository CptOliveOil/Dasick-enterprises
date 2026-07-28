import { getStore } from '@/lib/db';
import {
  agentEconomics,
  dailySeries,
  summariseFinance,
} from '@/lib/finance/calculations';
import { config } from '@/lib/config';
import { formatDuration, formatMoney, formatMoneyPrecise } from '@/lib/utils';
import { Panel, PanelHeader, Sparkline } from '@/components/ui';
import { PageShell, Section } from '@/components/layout/PageShell';

export const dynamic = 'force-dynamic';

/**
 * Finance is read straight from recorded transactions and API usage. Nothing on
 * this page is estimated forward — it is what actually happened.
 */
export default async function FinancePage() {
  const { store, ownerId } = await getStore();

  const [transactions, businesses, agents, usage] = await Promise.all([
    store.list('financial_transactions', { where: { owner_id: ownerId } }),
    store.list('businesses', { where: { owner_id: ownerId } }),
    store.list('agents', { where: { owner_id: ownerId } }),
    store.list('api_usage', { where: { owner_id: ownerId } }),
  ]);

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const month = summariseFinance(transactions, {
    from: monthStart,
    currency: config.currency,
  });
  const series = dailySeries(transactions, 30);
  const economics = agentEconomics(agents, usage);
  const currency = config.currency;

  const perBusiness = businesses.map((business) => ({
    business,
    summary: summariseFinance(transactions, {
      businessId: business.id,
      from: monthStart,
      currency,
    }),
  }));

  const totalTokens = usage.reduce((sum, u) => sum + u.input_tokens + u.output_tokens, 0);

  return (
    <PageShell
      title="Finance"
      description="Revenue, costs and profit across every business, plus what each agent costs to run."
      wide
    >
      <Section>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MoneyCard
            label="Revenue this month"
            value={formatMoney(month.revenue, currency)}
            tone="#34d399"
            series={series.map((p) => p.revenue)}
          />
          <MoneyCard
            label="Costs this month"
            value={formatMoney(
              month.expenses + month.aiCosts + month.subscriptions,
              currency,
            )}
            tone="#f87171"
            series={series.map((p) => p.cost)}
          />
          <MoneyCard
            label="AI spend"
            value={formatMoney(month.aiCosts, currency)}
            tone="#fbbf24"
            detail={`${(totalTokens / 1_000_000).toFixed(2)}M tokens recorded`}
          />
          <MoneyCard
            label="Profit"
            value={formatMoney(month.profit, currency)}
            tone={month.profit >= 0 ? '#e8ebf5' : '#f87171'}
          />
        </div>
      </Section>

      <Section title="By business">
        <div className="grid gap-3 md:grid-cols-2">
          {perBusiness.map(({ business, summary }) => (
            <Panel key={business.id} className="p-4">
              <p className="flex items-center gap-2 text-[14px] font-medium">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: business.colour }}
                />
                {business.name}
              </p>
              <dl className="mt-3 grid grid-cols-3 gap-3">
                <Figure label="Revenue" value={formatMoney(summary.revenue, currency)} tone="#34d399" />
                <Figure
                  label="Costs"
                  value={formatMoney(summary.expenses + summary.aiCosts, currency)}
                  tone="#f87171"
                />
                <Figure label="Profit" value={formatMoney(summary.profit, currency)} />
              </dl>
            </Panel>
          ))}
          {perBusiness.length === 0 && (
            <Panel className="p-6 text-center text-[13px] text-[var(--color-ink-muted)]">
              No businesses yet.
            </Panel>
          )}
        </div>
      </Section>

      <Section title="Agent economics">
        <Panel className="overflow-hidden">
          <PanelHeader title="What each agent costs to run" />
          <div className="scroll-thin overflow-x-auto">
            <table className="w-full min-w-[720px] text-left">
              <thead>
                <tr className="border-b border-[var(--color-edge-soft)]">
                  {['Agent', 'Total cost', 'This month', 'Completed', 'Avg / task', 'Success', 'Avg run'].map(
                    (header) => (
                      <th
                        key={header}
                        scope="col"
                        className="px-3.5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-ink-faint)]"
                      >
                        {header}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {economics.map((row) => (
                  <tr
                    key={row.agentId}
                    className="border-b border-[var(--color-edge-soft)] text-[13px] last:border-0"
                  >
                    <td className="px-3.5 py-2.5">{row.name}</td>
                    <td className="px-3.5 py-2.5 tabular-nums">
                      {formatMoneyPrecise(row.totalCost, currency)}
                    </td>
                    <td className="px-3.5 py-2.5 tabular-nums text-[var(--color-ink-muted)]">
                      {formatMoneyPrecise(row.costThisMonth, currency)}
                    </td>
                    <td className="px-3.5 py-2.5">{row.tasksCompleted}</td>
                    <td className="px-3.5 py-2.5 tabular-nums text-[var(--color-ink-muted)]">
                      {formatMoneyPrecise(row.averageCostPerTask, currency)}
                    </td>
                    <td className="px-3.5 py-2.5">
                      <span
                        className={
                          row.successRate >= 95
                            ? 'text-emerald-300'
                            : row.successRate >= 80
                              ? 'text-amber-300'
                              : 'text-red-300'
                        }
                      >
                        {row.successRate}%
                      </span>
                    </td>
                    <td className="px-3.5 py-2.5 text-[var(--color-ink-muted)]">
                      {formatDuration(row.averageExecutionMs)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </Section>

      <Section title="Recent transactions">
        <Panel className="overflow-hidden">
          <ul>
            {transactions
              .slice()
              .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
              .slice(0, 25)
              .map((transaction) => (
                <li
                  key={transaction.id}
                  className="flex items-center gap-3 border-b border-[var(--color-edge-soft)] px-4 py-2.5 text-[13px] last:border-0"
                >
                  <span className="w-[86px] shrink-0 text-[11px] uppercase tracking-[0.1em] text-[var(--color-ink-faint)]">
                    {transaction.kind.replace('_', ' ')}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{transaction.description}</span>
                  <span className="shrink-0 text-[11px] text-[var(--color-ink-faint)]">
                    {new Date(transaction.occurred_at).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                    })}
                  </span>
                  <span
                    className="w-[92px] shrink-0 text-right tabular-nums"
                    style={{
                      color: transaction.kind === 'revenue' ? '#34d399' : '#f87171',
                    }}
                  >
                    {transaction.kind === 'revenue' ? '+' : '−'}
                    {formatMoneyPrecise(transaction.amount, transaction.currency)}
                  </span>
                </li>
              ))}
          </ul>
        </Panel>
      </Section>
    </PageShell>
  );
}

function MoneyCard({
  label,
  value,
  tone,
  series,
  detail,
}: {
  label: string;
  value: string;
  tone: string;
  series?: number[];
  detail?: string;
}) {
  return (
    <Panel className="p-4">
      <p className="text-[11px] uppercase tracking-[0.1em] text-[var(--color-ink-faint)]">
        {label}
      </p>
      <p className="mt-1 text-[24px] font-semibold tracking-tight" style={{ color: tone }}>
        {value}
      </p>
      {series && <Sparkline points={series} colour={tone} className="mt-2" />}
      {detail && <p className="mt-1 text-[11px] text-[var(--color-ink-faint)]">{detail}</p>}
    </Panel>
  );
}

function Figure({ label, value, tone }: { label: string; value: string; tone?: string }) {
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
