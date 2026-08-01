import { describe, expect, it } from 'vitest';
import {
  agentEconomics,
  costForReference,
  dailySeries,
  successRate,
  summariseFinance,
} from '@/lib/finance/calculations';
import type { Agent, ApiUsage, FinancialTransaction } from '@/types/domain';
import { makeAgent } from './helpers';

const BUSINESS = '00000000-0000-4000-8000-0000000000c1';
const OTHER = '00000000-0000-4000-8000-0000000000c2';

function txn(
  kind: FinancialTransaction['kind'],
  amount: number,
  businessId: string | null = BUSINESS,
  daysAgo = 0,
): FinancialTransaction {
  const occurred = new Date(Date.now() - daysAgo * 86_400_000).toISOString();
  return {
    id: Math.random().toString(),
    owner_id: 'owner',
    business_id: businessId,
    kind,
    category: 'test',
    description: 'test',
    amount,
    currency: 'GBP',
    occurred_at: occurred,
    reference_type: null,
    reference_id: null,
    is_demo: false,
    created_at: occurred,
  };
}

describe('summariseFinance', () => {
  it('subtracts every kind of cost from revenue', () => {
    const summary = summariseFinance([
      txn('revenue', 1000),
      txn('expense', 100),
      txn('ai_cost', 50),
      txn('subscription', 25),
    ]);
    expect(summary.revenue).toBe(1000);
    expect(summary.profit).toBe(825);
  });

  it('scopes to a single business when asked', () => {
    const summary = summariseFinance([txn('revenue', 100), txn('revenue', 900, OTHER)], {
      businessId: BUSINESS,
    });
    expect(summary.revenue).toBe(100);
  });

  it('excludes transactions outside the window', () => {
    const from = new Date(Date.now() - 7 * 86_400_000);
    const summary = summariseFinance([txn('revenue', 100, BUSINESS, 2), txn('revenue', 900, BUSINESS, 30)], {
      from,
    });
    expect(summary.revenue).toBe(100);
  });

  it('reports a loss as a negative profit rather than clamping to zero', () => {
    expect(summariseFinance([txn('revenue', 10), txn('expense', 40)]).profit).toBe(-30);
  });

  it('handles an empty ledger', () => {
    const summary = summariseFinance([]);
    expect(summary).toMatchObject({ revenue: 0, profit: 0 });
  });
});

describe('dailySeries', () => {
  it('returns one bucket per day, oldest first', () => {
    const series = dailySeries([txn('revenue', 50, BUSINESS, 1)], 7);
    expect(series).toHaveLength(7);
    expect(series[0]!.date < series[6]!.date).toBe(true);
  });

  it('places a transaction in the right bucket', () => {
    const series = dailySeries([txn('revenue', 50, BUSINESS, 1)], 7);
    expect(series.reduce((sum, p) => sum + p.revenue, 0)).toBe(50);
  });

  it('counts every non-revenue kind as cost', () => {
    const series = dailySeries([txn('ai_cost', 5), txn('expense', 5), txn('subscription', 5)], 3);
    expect(series.reduce((sum, p) => sum + p.cost, 0)).toBe(15);
  });
});

describe('agentEconomics', () => {
  function usage(agentId: string, cost: number, daysAgo = 0): ApiUsage {
    const created = new Date(Date.now() - daysAgo * 86_400_000).toISOString();
    return {
      id: Math.random().toString(),
      owner_id: 'owner',
      business_id: null,
      agent_id: agentId,
      task_id: null,
      provider: 'anthropic',
      model: 'claude-sonnet-4-5',
      input_tokens: 1000,
      output_tokens: 500,
      estimated_cost: cost,
      duration_ms: 1000,
      is_demo: false,
      created_at: created,
    };
  }

  it('totals cost per agent and derives cost per task', () => {
    const agent: Agent = makeAgent({ capabilities: [], tasks_completed: 4 });
    const [row] = agentEconomics([agent], [usage(agent.id, 2), usage(agent.id, 2)]);
    expect(row!.totalCost).toBe(4);
    expect(row!.averageCostPerTask).toBe(1);
  });

  it('does not divide by zero for an agent that has completed nothing', () => {
    const agent: Agent = makeAgent({ capabilities: [], tasks_completed: 0 });
    const [row] = agentEconomics([agent], [usage(agent.id, 3)]);
    expect(row!.averageCostPerTask).toBe(0);
  });

  it('sorts the most expensive agent first', () => {
    const cheap = makeAgent({ capabilities: [], name: 'Cheap' });
    const dear = makeAgent({ capabilities: [], name: 'Dear' });
    const rows = agentEconomics([cheap, dear], [usage(cheap.id, 1), usage(dear.id, 9)]);
    expect(rows[0]!.name).toBe('Dear');
  });
});

describe('successRate', () => {
  it('treats an agent that has never run as fully successful', () => {
    expect(successRate({ tasks_completed: 0, tasks_failed: 0 })).toBe(100);
  });

  it('rounds to a whole percentage', () => {
    expect(successRate({ tasks_completed: 2, tasks_failed: 1 })).toBe(67);
  });
});

describe('costForReference', () => {
  it('sums only the spend attributed to one thing', () => {
    const linked = { ...txn('ai_cost', 3), reference_type: 'task', reference_id: 'c146b6ad-3827-4b93-8d94-d82f20703136' };
    const unlinked = txn('ai_cost', 9);
    expect(costForReference([linked, unlinked], 'task', 'c146b6ad-3827-4b93-8d94-d82f20703136')).toBe(3);
  });
});
