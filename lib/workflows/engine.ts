import 'server-only';
import { uuid } from '@/lib/ids';
import type { DataStore } from '@/lib/db/tables';
import { logActivity } from '@/lib/agents/activity';
import type {
  Mission,
  MissionStatus,
  Task,
  TaskPriority,
  WorkflowStep,
} from '@/types/domain';
import { findWorkflow } from './definitions';

export interface PlannedStep {
  capability: string;
  title: string;
  description?: string;
  /** Indices of earlier steps in the same array. */
  depends_on?: number[];
  requires_approval?: boolean;
  approval_label?: string;
  input?: Record<string, unknown>;
  priority?: TaskPriority;
  /** Stable key. Defaults to the capability's last segment. */
  key?: string;
}

export interface CreateMissionInput {
  ownerId: string;
  businessId: string | null;
  title: string;
  objective: string;
  workflowKey?: string | null;
  steps?: PlannedStep[];
  context?: Record<string, unknown>;
  /** Applied to the first step's input — used for one-shot commands. */
  seedInput?: Record<string, unknown>;
}

export interface CreatedMission {
  mission: Mission;
  tasks: Task[];
}

/**
 * Mission numbers are per-operator and human-facing ("MISSION #008"), so they
 * are derived from the highest existing number rather than a row count.
 */
async function nextMissionNumber(store: DataStore, ownerId: string): Promise<number> {
  const missions = await store.list('missions', { where: { owner_id: ownerId } });
  return missions.reduce((max, m) => Math.max(max, m.number), 0) + 1;
}

/**
 * Picks the agent for a capability: prefer one scoped to this business, fall
 * back to a global agent. Disabled and offline agents are never selected.
 */
export async function resolveAgentForCapability(
  store: DataStore,
  ownerId: string,
  capability: string,
  businessId: string | null,
): Promise<string | null> {
  const agents = await store.list('agents', { where: { owner_id: ownerId } });
  const eligible = agents.filter(
    (a) =>
      a.capabilities.includes(capability) &&
      a.status !== 'disabled' &&
      a.status !== 'offline',
  );
  if (eligible.length === 0) return null;
  const scoped = eligible.find((a) => a.business_id === businessId);
  return (scoped ?? eligible.find((a) => a.business_id === null) ?? eligible[0]!).id;
}

function stepsFromWorkflow(steps: WorkflowStep[]): PlannedStep[] {
  const indexByKey = new Map(steps.map((s, i) => [s.key, i]));
  return steps.map((step) => ({
    key: step.key,
    capability: step.capability,
    title: step.title,
    requires_approval: step.requires_approval,
    approval_label: step.approval_label,
    depends_on: step.depends_on
      .map((key) => indexByKey.get(key))
      .filter((i): i is number => i !== undefined),
  }));
}

export async function createMission(
  store: DataStore,
  input: CreateMissionInput,
): Promise<CreatedMission> {
  const workflow = input.workflowKey ? findWorkflow(input.workflowKey) : undefined;
  const planned =
    input.steps && input.steps.length > 0
      ? input.steps
      : workflow
        ? stepsFromWorkflow(workflow.steps)
        : [];

  if (planned.length === 0) {
    throw new Error('A mission needs at least one step.');
  }

  const timestamp = new Date().toISOString();
  const mission: Mission = {
    id: uuid(),
    owner_id: input.ownerId,
    business_id: input.businessId,
    number: await nextMissionNumber(store, input.ownerId),
    title: input.title,
    objective: input.objective,
    status: 'planning',
    workflow_definition_id: workflow?.id ?? null,
    context: input.context ?? {},
    progress: 0,
    is_demo: false,
    created_at: timestamp,
    updated_at: timestamp,
    completed_at: null,
  };
  await store.insert('missions', mission);

  const tasks: Task[] = [];
  for (const [index, step] of planned.entries()) {
    const agentId = await resolveAgentForCapability(
      store,
      input.ownerId,
      step.capability,
      input.businessId,
    );
    const stepKey = step.key ?? step.capability.split('.').pop() ?? `step_${index}`;
    const task: Task = {
      id: uuid(),
      owner_id: input.ownerId,
      mission_id: mission.id,
      business_id: input.businessId,
      agent_id: agentId,
      step_key: stepKey,
      title: step.title,
      description: step.description ?? '',
      // Only steps with no unmet dependency start queued; the rest wait.
      status: (step.depends_on?.length ?? 0) === 0 ? 'queued' : 'waiting',
      priority: step.priority ?? 'normal',
      input: {
        // Carry the step's capability onto the task: an agent may provide
        // several, and without this the engine falls back to its first one.
        capability: step.capability,
        ...(step.input ?? {}),
        ...(index === 0 ? (input.seedInput ?? {}) : {}),
        ...(step.requires_approval
          ? { requires_approval: true, approval_label: step.approval_label ?? step.title }
          : {}),
      },
      output: null,
      error: agentId ? null : `No available agent provides "${step.capability}".`,
      progress: 0,
      is_demo: false,
      created_at: timestamp,
      started_at: null,
      completed_at: null,
      due_at: null,
    };
    tasks.push(task);
  }
  await store.insertMany('tasks', tasks);

  for (const [index, step] of planned.entries()) {
    for (const dependency of step.depends_on ?? []) {
      const from = tasks[index];
      const to = tasks[dependency];
      if (!from || !to) continue;
      await store.insert('task_dependencies', {
        id: uuid(),
        task_id: from.id,
        depends_on_task_id: to.id,
      });
    }
  }

  if (workflow) {
    await store.insert('workflow_runs', {
      id: uuid(),
      mission_id: mission.id,
      workflow_definition_id: workflow.id,
      status: 'planning',
      step_tasks: Object.fromEntries(tasks.map((t) => [t.step_key ?? t.id, t.id])),
      created_at: timestamp,
      updated_at: timestamp,
    });
  }

  await logActivity(store, {
    ownerId: input.ownerId,
    businessId: input.businessId,
    missionId: mission.id,
    kind: 'mission_created',
    message: `Mission #${String(mission.number).padStart(3, '0')} created — ${mission.title}`,
    metadata: { steps: tasks.length },
  });

  return { mission, tasks };
}

/**
 * Tasks that can start right now: queued, with an agent, and with every
 * dependency completed.
 */
export async function getRunnableTasks(
  store: DataStore,
  missionId: string,
): Promise<Task[]> {
  const tasks = await store.list('tasks', { where: { mission_id: missionId } });
  const dependencies = await store.list('task_dependencies');
  const byId = new Map(tasks.map((t) => [t.id, t]));

  return tasks.filter((task) => {
    if (task.status !== 'queued') return false;
    if (!task.agent_id) return false;
    const deps = dependencies.filter((d) => d.task_id === task.id);
    return deps.every((d) => byId.get(d.depends_on_task_id)?.status === 'completed');
  });
}

/**
 * Moves `waiting` tasks to `queued` once their dependencies are satisfied.
 * Returns the tasks that became runnable.
 */
export async function releaseUnblockedTasks(
  store: DataStore,
  missionId: string,
): Promise<Task[]> {
  const tasks = await store.list('tasks', { where: { mission_id: missionId } });
  const dependencies = await store.list('task_dependencies');
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const released: Task[] = [];

  for (const task of tasks) {
    if (task.status !== 'waiting') continue;
    const deps = dependencies.filter((d) => d.task_id === task.id);
    const satisfied = deps.every(
      (d) => byId.get(d.depends_on_task_id)?.status === 'completed',
    );
    const anyFailed = deps.some((d) => {
      const upstream = byId.get(d.depends_on_task_id);
      return upstream?.status === 'failed' || upstream?.status === 'cancelled';
    });
    if (anyFailed) {
      await store.update('tasks', task.id, {
        status: 'cancelled',
        error: 'An upstream step failed, so this step was cancelled.',
      });
      continue;
    }
    if (satisfied && task.agent_id) {
      released.push(await store.update('tasks', task.id, { status: 'queued' }));
    }
  }
  return released;
}

/** Mission status and progress are always derived from the tasks, never set ad hoc. */
export function deriveMissionState(tasks: Task[]): {
  status: MissionStatus;
  progress: number;
} {
  if (tasks.length === 0) return { status: 'planning', progress: 0 };

  const counts = tasks.reduce<Record<Task['status'], number>>(
    (acc, t) => {
      acc[t.status] += 1;
      return acc;
    },
    {
      queued: 0,
      running: 0,
      waiting: 0,
      approval: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
    },
  );

  const finished = counts.completed + counts.cancelled;
  const progress = Math.round(
    ((counts.completed + counts.approval * 0.9 + counts.running * 0.5) / tasks.length) * 100,
  );

  let status: MissionStatus;
  if (counts.failed > 0) status = 'failed';
  else if (finished === tasks.length && counts.completed > 0) status = 'completed';
  else if (finished === tasks.length) status = 'cancelled';
  else if (counts.approval > 0) status = 'needs_approval';
  else if (counts.running > 0) status = 'running';
  else if (counts.queued > 0) status = 'running';
  else status = 'waiting';

  return { status, progress: Math.min(100, Math.max(0, progress)) };
}

export async function recomputeMission(
  store: DataStore,
  missionId: string,
): Promise<Mission | null> {
  const mission = await store.get('missions', missionId);
  if (!mission) return null;
  const tasks = await store.list('tasks', { where: { mission_id: missionId } });
  const { status, progress } = deriveMissionState(tasks);
  const timestamp = new Date().toISOString();

  const updated = await store.update('missions', missionId, {
    status,
    progress,
    updated_at: timestamp,
    completed_at: status === 'completed' ? (mission.completed_at ?? timestamp) : null,
  });

  const run = (await store.list('workflow_runs', { where: { mission_id: missionId } }))[0];
  if (run) {
    await store.update('workflow_runs', run.id, { status, updated_at: timestamp });
  }

  if (status === 'completed' && mission.status !== 'completed') {
    await logActivity(store, {
      ownerId: mission.owner_id,
      businessId: mission.business_id,
      missionId,
      kind: 'mission_completed',
      message: `Mission #${String(mission.number).padStart(3, '0')} completed — ${mission.title}`,
    });
  }
  return updated;
}
