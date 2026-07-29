import type {
  Agent,
  FinancialTransaction,
  Mission,
  Task,
  YoutubeIdea,
  YoutubeVideo,
} from '@/types/domain';

/**
 * What happened today, counted from records.
 *
 * A metric only appears when there is something behind it. `null` here means
 * "no data", and the UI renders it as `—` rather than as a confident zero: a
 * channel with no analytics connection has *unknown* views, not nought views,
 * and the difference matters when deciding whether something is working.
 */
export interface TodaySummary {
  completed: number;
  working: number;
  queued: number;
  waiting: number;
  failed: number;
  /** AI token spend recorded today. Always known, since we record it ourselves. */
  aiSpend: number;
  /** Provider/media spend today. */
  productionSpend: number;
  currency: string;
  /** Null when nothing has reached the video pipeline at all. */
  videosCompleted: number | null;
  ideasGenerated: number | null;
  researchCompleted: number | null;
}

export interface TodayInput {
  tasks: Task[];
  transactions: FinancialTransaction[];
  videos?: YoutubeVideo[];
  ideas?: YoutubeIdea[];
  currency: string;
  now?: Date;
}

export function startOfToday(now = new Date()): Date {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return start;
}

export function summariseToday(input: TodayInput): TodaySummary {
  const since = startOfToday(input.now).getTime();
  const isToday = (timestamp: string | null) =>
    Boolean(timestamp) && new Date(timestamp!).getTime() >= since;

  const completedToday = input.tasks.filter((task) => isToday(task.completed_at));

  const todaySpend = input.transactions.filter((t) => isToday(t.occurred_at ?? t.created_at));

  const research = completedToday.filter((task) =>
    /research/i.test(String(task.input.capability ?? task.step_key ?? '')),
  );

  return {
    completed: completedToday.filter((task) => task.status === 'completed').length,
    working: input.tasks.filter((task) => task.status === 'running').length,
    queued: input.tasks.filter((task) => task.status === 'queued').length,
    waiting: input.tasks.filter((task) => task.status === 'waiting').length,
    failed: completedToday.filter((task) => task.status === 'failed').length,
    aiSpend: round(
      todaySpend.filter((t) => t.kind === 'ai_cost' && !isProviderSpend(t)).reduce(sum, 0),
    ),
    productionSpend: round(todaySpend.filter(isProviderSpend).reduce(sum, 0)),
    currency: input.currency,
    // Undefined input means the caller did not load that table; that is
    // genuinely "unknown", not zero.
    videosCompleted: input.videos
      ? input.videos.filter((video) => isToday(video.updated_at) && video.status === 'ready').length
      : null,
    ideasGenerated: input.ideas
      ? input.ideas.filter((idea) => isToday(idea.created_at)).length
      : null,
    researchCompleted: input.tasks.length > 0 ? research.length : null,
  };
}

/**
 * Media and provider spend, as opposed to AI token spend.
 *
 * Both are recorded as `ai_cost` transactions because both are model-provider
 * charges; what separates them is that provider spend names the product.
 */
function isProviderSpend(transaction: FinancialTransaction): boolean {
  return (
    transaction.kind === 'ai_cost' &&
    /voice|image|video|stock|render|elevenlabs|replicate|fal/i.test(
      `${transaction.description} ${transaction.category ?? ''}`,
    )
  );
}

const sum = (total: number, t: FinancialTransaction) => total + Math.abs(t.amount);
const round = (value: number) => Number(value.toFixed(4));

/* ------------------------------------------------------------------ */
/* Agent workload                                                      */
/* ------------------------------------------------------------------ */

export const WORKLOAD_BANDS = ['idle', 'light', 'busy', 'overloaded'] as const;
export type WorkloadBand = (typeof WORKLOAD_BANDS)[number];

/**
 * Deterministic thresholds, counted from tasks — not estimated.
 *
 * Live work is running + queued + waiting-on-a-dependency for this agent. The
 * boundaries are stated here rather than being spread through the UI so they
 * can be made configurable later without hunting for them.
 */
export const WORKLOAD_THRESHOLDS = { light: 1, busy: 2, overloaded: 5 } as const;

export function workloadBand(activeTasks: number): WorkloadBand {
  if (activeTasks <= 0) return 'idle';
  if (activeTasks < WORKLOAD_THRESHOLDS.busy) return 'light';
  if (activeTasks < WORKLOAD_THRESHOLDS.overloaded) return 'busy';
  return 'overloaded';
}

export interface AgentWorkload {
  agentId: string;
  currentTaskId: string | null;
  currentTaskTitle: string | null;
  queued: number;
  active: number;
  completedToday: number;
  failedToday: number;
  costToday: number;
  band: WorkloadBand;
}

export function agentWorkloads(
  agents: Agent[],
  tasks: Task[],
  transactions: FinancialTransaction[],
  now = new Date(),
): AgentWorkload[] {
  const since = startOfToday(now).getTime();
  const isToday = (timestamp: string | null) =>
    Boolean(timestamp) && new Date(timestamp!).getTime() >= since;

  return agents.map((agent) => {
    const mine = tasks.filter((task) => task.agent_id === agent.id);
    const running = mine.find((task) => task.status === 'running') ?? null;
    const queued = mine.filter(
      (task) => task.status === 'queued' || task.status === 'waiting',
    ).length;
    const active = (running ? 1 : 0) + queued;

    const taskIds = new Set(mine.map((task) => task.id));
    const costToday = transactions
      .filter(
        (t) =>
          isToday(t.occurred_at ?? t.created_at) &&
          ((t.reference_type === 'agent' && t.reference_id === agent.id) ||
            (t.reference_type === 'task' && t.reference_id && taskIds.has(t.reference_id))),
      )
      .reduce((total, t) => total + Math.abs(t.amount), 0);

    return {
      agentId: agent.id,
      currentTaskId: running?.id ?? null,
      currentTaskTitle: running?.title ?? null,
      queued,
      active,
      completedToday: mine.filter((task) => isToday(task.completed_at) && task.status === 'completed')
        .length,
      failedToday: mine.filter((task) => isToday(task.completed_at) && task.status === 'failed')
        .length,
      costToday: round(costToday),
      band: workloadBand(active),
    };
  });
}

/* ------------------------------------------------------------------ */
/* Mission timing                                                      */
/* ------------------------------------------------------------------ */

export const DEADLINE_STATES = ['on_track', 'at_risk', 'overdue', 'none'] as const;
export type DeadlineState = (typeof DEADLINE_STATES)[number];

/**
 * How a mission stands against its deadline.
 *
 * Deliberately crude, and honest about being so. There is no model of how long
 * a step takes — steps depend on providers, approvals and the operator's own
 * response time, none of which are predictable. So this answers only what can
 * be answered from state: has the date passed, is the mission blocked or
 * waiting on a person with the date close, or is it simply progressing.
 */
export function deadlineState(
  mission: Pick<Mission, 'status' | 'target_date' | 'target_time'>,
  options: { blocked?: boolean; now?: Date } = {},
): DeadlineState {
  if (!mission.target_date) return 'none';
  if (mission.status === 'completed' || mission.status === 'cancelled') return 'none';

  const now = options.now ?? new Date();
  const due = new Date(`${mission.target_date}T${mission.target_time ?? '23:59'}:00`);
  if (Number.isNaN(due.getTime())) return 'none';

  if (due.getTime() < now.getTime()) return 'overdue';

  const hoursLeft = (due.getTime() - now.getTime()) / 3_600_000;
  // Anything stopped — failed, waiting for a person, or explicitly blocked —
  // is at risk once the deadline is inside a day, because nothing moves without
  // an intervention that has not happened yet.
  const stalled =
    options.blocked === true || mission.status === 'needs_approval' || mission.status === 'failed';
  if (stalled && hoursLeft < 24) return 'at_risk';
  if (stalled && hoursLeft < 72) return 'at_risk';
  return 'on_track';
}

export const DEADLINE_LABELS: Record<DeadlineState, string> = {
  on_track: 'On track',
  at_risk: 'At risk',
  overdue: 'Overdue',
  none: '—',
};
