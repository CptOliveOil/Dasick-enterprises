'use client';

import { useWorkforce } from '@/lib/store/workforce';
import { formatMoney } from '@/lib/utils';

/**
 * Global workforce numbers. Deliberately a thin strip — statistics support the
 * galaxy, they do not compete with it.
 */
export function MetricsStrip({ className }: { className?: string }) {
  const metrics = useWorkforce((s) => s.snapshot?.metrics);
  const loading = useWorkforce((s) => s.loading);

  const items = metrics
    ? [
        { value: metrics.agentsActive, label: 'Agents active', tone: '#34d399' },
        { value: metrics.tasksRunning, label: 'Tasks running', tone: '#38bdf8' },
        {
          value: metrics.awaitingApproval,
          label: 'Awaiting approval',
          tone: metrics.awaitingApproval > 0 ? '#fbbf24' : undefined,
        },
        { value: metrics.completedToday, label: 'Completed today' },
        {
          value: formatMoney(metrics.revenue, metrics.currency),
          label: 'Revenue (month)',
          tone: '#34d399',
        },
        {
          value: formatMoney(metrics.aiCosts, metrics.currency),
          label: 'AI costs',
          tone: '#f87171',
        },
        { value: formatMoney(metrics.profit, metrics.currency), label: 'Profit' },
      ]
    : [];

  return (
    <div
      className={`scroll-thin flex shrink-0 items-center gap-5 overflow-x-auto border-b border-[var(--color-edge)] bg-[var(--color-deep)]/40 px-4 py-2 ${className ?? ''}`}
    >
      {loading && !metrics && (
        <span className="animate-breathe text-[11px] uppercase tracking-[0.14em] text-[var(--color-ink-faint)]">
          Reading workforce state
        </span>
      )}
      {items.map((item) => (
        <span key={item.label} className="flex shrink-0 items-baseline gap-1.5">
          <span
            className="text-[13px] font-semibold tabular-nums"
            style={item.tone ? { color: item.tone } : undefined}
          >
            {item.value}
          </span>
          <span className="text-[11px] text-[var(--color-ink-faint)]">{item.label}</span>
        </span>
      ))}
    </div>
  );
}
