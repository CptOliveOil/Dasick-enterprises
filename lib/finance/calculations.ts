import type { Agent, ApiUsage, FinancialTransaction } from '@/types/domain';

export interface FinanceSummary {
  revenue: number;
  expenses: number;
  aiCosts: number;
  subscriptions: number;
  profit: number;
  currency: string;
}

export interface SeriesPoint {
  date: string;
  revenue: number;
  cost: number;
}

function inRange(iso: string, from: Date, to: Date): boolean {
  const t = new Date(iso).getTime();
  return t >= from.getTime() && t <= to.getTime();
}

export function summariseFinance(
  transactions: FinancialTransaction[],
  options: { businessId?: string | null; from?: Date; to?: Date; currency?: string } = {},
): FinanceSummary {
  const from = options.from ?? new Date(0);
  const to = options.to ?? new Date();
  const rows = transactions.filter((t) => {
    if (options.businessId !== undefined && options.businessId !== null) {
      if (t.business_id !== options.businessId) return false;
    }
    return inRange(t.occurred_at, from, to);
  });

  const total = (kind: FinancialTransaction['kind']) =>
    rows.filter((r) => r.kind === kind).reduce((sum, r) => sum + r.amount, 0);

  const revenue = total('revenue');
  const expenses = total('expense');
  const aiCosts = total('ai_cost');
  const subscriptions = total('subscription');

  return {
    revenue: round(revenue),
    expenses: round(expenses),
    aiCosts: round(aiCosts),
    subscriptions: round(subscriptions),
    profit: round(revenue - expenses - aiCosts - subscriptions),
    currency: options.currency ?? 'GBP',
  };
}

/** Daily revenue vs total cost, oldest first. Used for the finance sparklines. */
export function dailySeries(
  transactions: FinancialTransaction[],
  days = 30,
  businessId?: string | null,
): SeriesPoint[] {
  const buckets = new Map<string, SeriesPoint>();
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));

  for (let i = 0; i < days; i += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    buckets.set(key, { date: key, revenue: 0, cost: 0 });
  }

  for (const t of transactions) {
    if (businessId && t.business_id !== businessId) continue;
    const key = t.occurred_at.slice(0, 10);
    const bucket = buckets.get(key);
    if (!bucket) continue;
    if (t.kind === 'revenue') bucket.revenue += t.amount;
    else bucket.cost += t.amount;
  }

  return [...buckets.values()].map((p) => ({
    ...p,
    revenue: round(p.revenue),
    cost: round(p.cost),
  }));
}

export interface AgentEconomics {
  agentId: string;
  name: string;
  totalCost: number;
  costThisMonth: number;
  tasksCompleted: number;
  tasksFailed: number;
  averageCostPerTask: number;
  successRate: number;
  averageExecutionMs: number;
}

/** Per-agent economics — the numbers that decide whether an agent earns its keep. */
export function agentEconomics(agents: Agent[], usage: ApiUsage[]): AgentEconomics[] {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  return agents
    .map((agent) => {
      const rows = usage.filter((u) => u.agent_id === agent.id);
      const totalCost = rows.reduce((sum, u) => sum + u.estimated_cost, 0);
      const costThisMonth = rows
        .filter((u) => new Date(u.created_at) >= monthStart)
        .reduce((sum, u) => sum + u.estimated_cost, 0);
      const attempted = agent.tasks_completed + agent.tasks_failed;

      return {
        agentId: agent.id,
        name: agent.name,
        totalCost: round(totalCost, 4),
        costThisMonth: round(costThisMonth, 4),
        tasksCompleted: agent.tasks_completed,
        tasksFailed: agent.tasks_failed,
        averageCostPerTask:
          agent.tasks_completed > 0 ? round(totalCost / agent.tasks_completed, 4) : 0,
        successRate: attempted > 0 ? Math.round((agent.tasks_completed / attempted) * 100) : 100,
        averageExecutionMs: agent.average_execution_time,
      };
    })
    .sort((a, b) => b.totalCost - a.totalCost);
}

export function successRate(agent: Pick<Agent, 'tasks_completed' | 'tasks_failed'>): number {
  const attempted = agent.tasks_completed + agent.tasks_failed;
  return attempted === 0 ? 100 : Math.round((agent.tasks_completed / attempted) * 100);
}

/** Total AI spend attributable to one thing, e.g. a video. */
export function costForReference(
  transactions: FinancialTransaction[],
  referenceType: string,
  referenceId: string,
): number {
  return round(
    transactions
      .filter((t) => t.reference_type === referenceType && t.reference_id === referenceId)
      .reduce((sum, t) => sum + t.amount, 0),
    4,
  );
}

function round(value: number, places = 2): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}
