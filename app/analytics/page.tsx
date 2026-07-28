import Link from 'next/link';
import { getStore } from '@/lib/db';
import { agentEconomics, dailySeries, summariseFinance } from '@/lib/finance/calculations';
import { config } from '@/lib/config';
import { formatCompact, formatDuration, formatMoney, formatNumber } from '@/lib/utils';
import { Panel, Sparkline } from '@/components/ui';
import { PageShell, Section } from '@/components/layout/PageShell';

export const dynamic = 'force-dynamic';

/**
 * Cross-business analytics. Everything here is computed from stored rows, so a
 * figure that is missing means the data was never recorded — not that it is zero.
 */
export default async function AnalyticsPage() {
  const { store, ownerId } = await getStore();

  const [agents, tasks, missions, usage, transactions, ytAnalytics, videos] = await Promise.all([
    store.list('agents', { where: { owner_id: ownerId } }),
    store.list('tasks', { where: { owner_id: ownerId }, limit: 1000 }),
    store.list('missions', { where: { owner_id: ownerId } }),
    store.list('api_usage', { where: { owner_id: ownerId } }),
    store.list('financial_transactions', { where: { owner_id: ownerId } }),
    store.list('youtube_analytics'),
    store.list('youtube_videos'),
  ]);

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const finance = summariseFinance(transactions, { from: monthStart, currency: config.currency });
  const series = dailySeries(transactions, 30);
  const economics = agentEconomics(agents, usage);

  const completed = tasks.filter((t) => t.status === 'completed').length;
  const failed = tasks.filter((t) => t.status === 'failed').length;
  const attempted = completed + failed;
  const workforceSuccess = attempted > 0 ? Math.round((completed / attempted) * 100) : 100;

  const totalViews = ytAnalytics.reduce((sum, a) => sum + a.views, 0);
  const publishedVideos = videos.filter((v) => v.status === 'published').length;
  const costPerCompletedTask =
    completed > 0
      ? usage.reduce((sum, u) => sum + u.estimated_cost, 0) / completed
      : 0;

  return (
    <PageShell
      title="Analytics"
      description="How the workforce and the businesses are performing, computed from recorded data."
      wide
    >
      <Section title="Workforce">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Tasks completed" value={formatNumber(completed)} tone="#34d399" />
          <Stat label="Tasks failed" value={formatNumber(failed)} tone={failed ? '#f87171' : undefined} />
          <Stat label="Success rate" value={`${workforceSuccess}%`} />
          <Stat
            label="Avg cost / completed task"
            value={formatMoney(costPerCompletedTask, config.currency)}
          />
        </div>
      </Section>

      <Section title="Missions">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Total missions" value={missions.length} />
          <Stat
            label="Running"
            value={missions.filter((m) => ['running', 'planning'].includes(m.status)).length}
            tone="#38bdf8"
          />
          <Stat
            label="Needing approval"
            value={missions.filter((m) => m.status === 'needs_approval').length}
            tone="#fbbf24"
          />
          <Stat
            label="Completed"
            value={missions.filter((m) => m.status === 'completed').length}
            tone="#34d399"
          />
        </div>
      </Section>

      <Section title="Money, last 30 days">
        <Panel className="p-4">
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <p className="text-[11px] uppercase tracking-[0.1em] text-[var(--color-ink-faint)]">
                Revenue
              </p>
              <p className="mt-1 text-[22px] font-semibold text-emerald-300">
                {formatMoney(finance.revenue, config.currency)}
              </p>
              <Sparkline points={series.map((p) => p.revenue)} colour="#34d399" className="mt-2" />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.1em] text-[var(--color-ink-faint)]">
                Cost
              </p>
              <p className="mt-1 text-[22px] font-semibold text-red-300">
                {formatMoney(
                  finance.expenses + finance.aiCosts + finance.subscriptions,
                  config.currency,
                )}
              </p>
              <Sparkline points={series.map((p) => p.cost)} colour="#f87171" className="mt-2" />
            </div>
          </div>
          <Link
            href="/finance"
            className="mt-3 inline-block text-[12px] text-amber-400 underline-offset-4 hover:underline"
          >
            Open finance →
          </Link>
        </Panel>
      </Section>

      <Section title="Content">
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Videos published" value={publishedVideos} />
          <Stat label="Recorded views" value={formatCompact(totalViews)} tone="#38bdf8" />
          <Stat label="Videos in pipeline" value={videos.length - publishedVideos} />
        </div>
      </Section>

      <Section title="Most expensive agents">
        <Panel className="overflow-hidden">
          <ul>
            {economics.slice(0, 6).map((row) => (
              <li
                key={row.agentId}
                className="flex items-center gap-3 border-b border-[var(--color-edge-soft)] px-4 py-2.5 text-[13px] last:border-0"
              >
                <span className="min-w-0 flex-1 truncate">{row.name}</span>
                <span className="shrink-0 text-[11px] text-[var(--color-ink-faint)]">
                  {row.tasksCompleted} tasks · {formatDuration(row.averageExecutionMs)} avg
                </span>
                <span className="w-[86px] shrink-0 text-right tabular-nums">
                  {formatMoney(row.totalCost, config.currency)}
                </span>
              </li>
            ))}
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
        className="mt-1 text-[22px] font-semibold tracking-tight"
        style={tone ? { color: tone } : undefined}
      >
        {value}
      </p>
    </Panel>
  );
}
