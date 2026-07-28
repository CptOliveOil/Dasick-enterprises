import 'server-only';
import { anthropicConfigured, config } from '@/lib/config';
import type { DataStore } from '@/lib/db/tables';
import { summariseFinance } from '@/lib/finance/calculations';
import type { LiveConnection, WorkforceSnapshot } from '@/types/state';

/** How long a handoff keeps drawing a beam between two planets. */
const CONNECTION_WINDOW_MS = 45_000;

const ACTIVE_STATUSES = new Set(['working', 'waiting', 'needs_approval', 'idle']);

export async function buildSnapshot(
  store: DataStore,
  ownerId: string,
  isDemo: boolean,
): Promise<WorkforceSnapshot> {
  const [
    businesses,
    agents,
    missions,
    tasks,
    approvals,
    activity,
    notifications,
    commandMessages,
    transactions,
  ] = await Promise.all([
    store.list('businesses', { where: { owner_id: ownerId } }),
    store.list('agents', { where: { owner_id: ownerId } }),
    store.list('missions', {
      where: { owner_id: ownerId },
      orderBy: { column: 'created_at', ascending: false },
    }),
    store.list('tasks', {
      where: { owner_id: ownerId },
      orderBy: { column: 'created_at', ascending: false },
      limit: 400,
    }),
    store.list('approvals', {
      where: { owner_id: ownerId },
      orderBy: { column: 'created_at', ascending: false },
    }),
    store.list('activity_logs', {
      where: { owner_id: ownerId },
      orderBy: { column: 'created_at', ascending: false },
      limit: 80,
    }),
    store.list('notifications', {
      where: { owner_id: ownerId },
      orderBy: { column: 'created_at', ascending: false },
      limit: 40,
    }),
    store.list('command_messages', {
      where: { owner_id: ownerId },
      orderBy: { column: 'created_at', ascending: true },
      limit: 60,
    }),
    store.list('financial_transactions', { where: { owner_id: ownerId } }),
  ]);

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const finance = summariseFinance(transactions, {
    from: startOfMonth(),
    currency: config.currency,
  });

  const connections: LiveConnection[] = activity
    .filter(
      (log) =>
        log.kind === 'handoff' &&
        log.agent_id &&
        log.target_agent_id &&
        Date.now() - new Date(log.created_at).getTime() < CONNECTION_WINDOW_MS,
    )
    .map((log) => ({
      id: log.id,
      fromAgentId: log.agent_id!,
      toAgentId: log.target_agent_id!,
      createdAt: log.created_at,
      message: log.message,
    }));

  return {
    version: await store.version(),
    generatedAt: new Date().toISOString(),
    demo: isDemo,
    aiLive: anthropicConfigured,
    businesses,
    agents,
    missions,
    tasks,
    approvals,
    activity,
    notifications,
    commandMessages,
    connections,
    metrics: {
      agentsActive: agents.filter((a) => ACTIVE_STATUSES.has(a.status)).length,
      agentsTotal: agents.length,
      tasksRunning: tasks.filter((t) => t.status === 'running').length,
      awaitingApproval: approvals.filter((a) => a.status === 'pending').length,
      completedToday: tasks.filter(
        (t) => t.completed_at && new Date(t.completed_at) >= startOfDay,
      ).length,
      revenue: finance.revenue,
      aiCosts: finance.aiCosts,
      expenses: finance.expenses + finance.subscriptions,
      profit: finance.profit,
      currency: finance.currency,
    },
  };
}

function startOfMonth(): Date {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}
