import 'server-only';
import { config } from '@/lib/config';
import type { DataStore } from '@/lib/db/tables';
import { buildNeedsYou, type NeedsYouItem } from './needs-you';
import { agentWorkloads, deadlineState, summariseToday, type TodaySummary } from './today';

/**
 * The workspace, flattened into facts.
 *
 * This is what the Manager is given when it writes a briefing or a
 * recommendation. It is *only* facts drawn from stored records: counts, titles,
 * statuses, numbers, timestamps. The Manager's job is to read and prioritise
 * them, not to remember or infer events — anything not in here did not happen
 * as far as the briefing is concerned, and the prompt says so explicitly.
 */
export interface OperationsDigest {
  generatedAt: string;
  currency: string;
  businesses: {
    id: string;
    name: string;
    kind: string;
    activeMissions: number;
    pendingApprovals: number;
    agents: number;
    costThisMonth: number;
    revenueThisMonth: number | null;
  }[];
  missions: {
    id: string;
    number: number;
    title: string;
    status: string;
    priority: string;
    progress: number;
    business: string | null;
    deadline: string | null;
    deadlineState: string;
    blockedReason: string | null;
  }[];
  needsYou: {
    kind: string;
    title: string;
    explanation: string;
    business: string | null;
    mission: number | null;
    agent: string | null;
    urgency: string;
    waitingSince: string;
  }[];
  today: TodaySummary;
  agents: {
    name: string;
    status: string;
    business: string | null;
    active: number;
    completedToday: number;
    failedToday: number;
    band: string;
  }[];
  recentlyCompleted: { title: string; mission: number | null; at: string }[];
  recentFailures: { title: string; error: string | null; mission: number | null; at: string }[];
  providerProblems: string[];
}

export async function buildDigest(
  store: DataStore,
  ownerId: string,
): Promise<{ digest: OperationsDigest; needsYou: NeedsYouItem[] }> {
  const [businesses, agents, missions, tasks, approvals, transactions, videos, ideas] =
    await Promise.all([
      store.list('businesses', { where: { owner_id: ownerId } }),
      store.list('agents', { where: { owner_id: ownerId } }),
      store.list('missions', { where: { owner_id: ownerId } }),
      store.list('tasks', { where: { owner_id: ownerId } }),
      store.list('approvals', { where: { owner_id: ownerId } }),
      store.list('financial_transactions', { where: { owner_id: ownerId } }),
      store.list('youtube_videos'),
      store.list('youtube_ideas'),
    ]);

  const businessIds = new Set(businesses.map((business) => business.id));
  const ownVideos = videos.filter((video) => businessIds.has(video.business_id));
  const ownIdeas = ideas.filter((idea) => businessIds.has(idea.business_id));

  const needsYou = buildNeedsYou({ businesses, agents, missions, tasks, approvals });
  const today = summariseToday({
    tasks,
    transactions,
    videos: ownVideos,
    ideas: ownIdeas,
    currency: config.currency,
  });
  const workloads = agentWorkloads(agents, tasks, transactions);

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const nameOf = (id: string | null) =>
    id ? (businesses.find((business) => business.id === id)?.name ?? null) : null;

  const active = missions.filter(
    (mission) => !['completed', 'cancelled'].includes(mission.status),
  );

  const failedTasks = tasks
    .filter((task) => task.status === 'failed')
    .sort((a, b) => (b.completed_at ?? b.created_at).localeCompare(a.completed_at ?? a.created_at));

  return {
    needsYou,
    digest: {
      generatedAt: new Date().toISOString(),
      currency: config.currency,
      businesses: businesses.map((business) => {
        const spend = transactions
          .filter(
            (t) =>
              t.business_id === business.id &&
              new Date(t.occurred_at ?? t.created_at) >= monthStart &&
              t.kind !== 'revenue',
          )
          .reduce((total, t) => total + Math.abs(t.amount), 0);
        const revenue = transactions.filter(
          (t) =>
            t.business_id === business.id &&
            t.kind === 'revenue' &&
            new Date(t.occurred_at ?? t.created_at) >= monthStart,
        );
        return {
          id: business.id,
          name: business.name,
          kind: business.kind,
          activeMissions: active.filter((mission) => mission.business_id === business.id).length,
          pendingApprovals: approvals.filter(
            (approval) => approval.status === 'pending' && approval.business_id === business.id,
          ).length,
          agents: agents.filter(
            (agent) => agent.business_id === business.id && !agent.archived_at,
          ).length,
          costThisMonth: Number(spend.toFixed(4)),
          // No revenue rows means unknown, not zero — a channel with no
          // connected analytics has not earned nothing, we simply cannot say.
          revenueThisMonth:
            revenue.length > 0
              ? Number(revenue.reduce((total, t) => total + t.amount, 0).toFixed(2))
              : null,
        };
      }),
      missions: active
        .slice()
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, 25)
        .map((mission) => {
          const missionTasks = tasks.filter((task) => task.mission_id === mission.id);
          const blocked = missionTasks.find((task) => task.status === 'failed');
          return {
            id: mission.id,
            number: mission.number,
            title: mission.title,
            status: mission.status,
            priority: mission.priority,
            progress: mission.progress,
            business: nameOf(mission.business_id),
            deadline: mission.target_date,
            deadlineState: deadlineState(mission, { blocked: Boolean(blocked) }),
            blockedReason: blocked?.error ?? null,
          };
        }),
      needsYou: needsYou.map((item) => ({
        kind: item.kind,
        title: item.title,
        explanation: item.explanation,
        business: item.businessName,
        mission: item.missionNumber,
        agent: item.agentName,
        urgency: item.urgency,
        waitingSince: item.createdAt,
      })),
      today,
      agents: agents
        .filter((agent) => !agent.archived_at)
        .map((agent) => {
          const workload = workloads.find((entry) => entry.agentId === agent.id);
          return {
            name: agent.name,
            status: agent.status,
            business: nameOf(agent.business_id),
            active: workload?.active ?? 0,
            completedToday: workload?.completedToday ?? 0,
            failedToday: workload?.failedToday ?? 0,
            band: workload?.band ?? 'idle',
          };
        }),
      recentlyCompleted: tasks
        .filter((task) => task.status === 'completed' && task.completed_at)
        .sort((a, b) => b.completed_at!.localeCompare(a.completed_at!))
        .slice(0, 10)
        .map((task) => ({
          title: task.title,
          mission: missions.find((mission) => mission.id === task.mission_id)?.number ?? null,
          at: task.completed_at!,
        })),
      recentFailures: failedTasks.slice(0, 10).map((task) => ({
        title: task.title,
        error: task.error,
        mission: missions.find((mission) => mission.id === task.mission_id)?.number ?? null,
        at: task.completed_at ?? task.created_at,
      })),
      providerProblems: [
        ...new Set(
          failedTasks
            .filter((task) => /not connected|provider|credential|api key/i.test(task.error ?? ''))
            .map((task) => task.error!)
            .slice(0, 5),
        ),
      ],
    },
  };
}
