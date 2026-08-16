import 'server-only';
import { uuid } from '@/lib/ids';
import type { DataStore } from '@/lib/db/tables';
import { logActivity } from '@/lib/agents/activity';
import { businessCapabilitiesWithoutBusiness, ScopeViolation } from '@/lib/agents/scope';
import type {
  Mission,
  MissionPriority,
  MissionStatus,
  Task,
  TaskPriority,
  WorkflowDefinition,
  WorkflowRun,
  WorkflowStep,
} from '@/types/domain';
import { findWorkflow, WORKFLOW_DEFINITIONS } from './definitions';

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
  priority?: MissionPriority;
  /** ISO date. Only set when a deadline was genuinely asked for. */
  targetDate?: string | null;
  /** HH:MM alongside `targetDate`. */
  targetTime?: string | null;
  /** Set when this mission is one business' (or shared infrastructure's) share of a system mission. */
  parentMissionId?: string | null;
  /**
   * Permits a mission with no tasks of its own — only for a pure orchestrator
   * whose status is entirely derived from its children (see
   * `recomputeMission`). Every ordinary mission still needs at least one step;
   * this does not relax that for anything but an explicit opt-in.
   */
  allowNoSteps?: boolean;
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
 * back to a global agent. Disabled, offline and archived agents are never
 * selected.
 *
 * Business scoping is what keeps two channels apart. An Islamic Channel with
 * its own researcher gets that researcher; a general YouTube mission does not,
 * because that agent is not scoped to it.
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
      a.status !== 'offline' &&
      !a.archived_at,
  );
  if (eligible.length === 0) return null;
  const scoped = eligible.find((a) => a.business_id === businessId);
  return (scoped ?? eligible.find((a) => a.business_id === null) ?? eligible[0]!).id;
}

/**
 * A workflow key resolved against both sources: code first, then the
 * database. `findWorkflow` alone only ever finds a built-in, so a genuinely
 * custom workflow (an owner-created row in `workflow_definitions`, the one
 * thing that table is for — see `lib/workspace/provision.ts`) was never
 * reachable through `workflowKey` at all until this.
 */
async function resolveWorkflow(
  store: DataStore,
  ownerId: string,
  key: string,
): Promise<WorkflowDefinition | undefined> {
  const builtIn = findWorkflow(key);
  if (builtIn) return builtIn;
  const rows = await store.list('workflow_definitions', { where: { owner_id: ownerId, key } });
  return rows[0];
}

/**
 * The workflow a run identifies, whichever way it identifies it.
 *
 * `workflow_key` is checked first — cheap, and correct for every run written
 * since migration 0011. A run from before that migration has no `workflow_key`
 * but does have a `workflow_definition_id`, which for a built-in is a
 * deterministic hash (`stableId`) that was never a database row; matching it
 * against `WORKFLOW_DEFINITIONS` by id resolves those old runs without a
 * backfill. A genuinely custom workflow's id *is* a real row either way, so
 * the database lookup still finds it.
 */
export async function resolveRunWorkflow(
  store: DataStore,
  run: Pick<WorkflowRun, 'workflow_key' | 'workflow_definition_id'>,
): Promise<WorkflowDefinition | undefined> {
  if (run.workflow_key) {
    const builtIn = findWorkflow(run.workflow_key);
    if (builtIn) return builtIn;
  }
  if (run.workflow_definition_id) {
    const row = await store.get('workflow_definitions', run.workflow_definition_id).catch(() => null);
    if (row) return row;
    const builtIn = WORKFLOW_DEFINITIONS.find((w) => w.id === run.workflow_definition_id);
    if (builtIn) return builtIn;
  }
  return undefined;
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

/**
 * A unique, stable key for every step in a mission.
 *
 * Two bugs lived in the one line this replaces:
 *
 *   const stepKey = step.key ?? step.capability.split('.').pop();
 *
 * **It was not unique.** `youtube.voiceover.generate` and
 * `youtube.thumbnail.generate` both reduce to `generate`, as do
 * `youtube.research.ideas` and `pokemon.research.ideas`. Step keys index two
 * things — `loadPreviousOutputs`, which builds the map an agent reads as the
 * work so far, and `workflow_runs.step_tasks` — and both are plain objects, so
 * a collision silently discarded one step's output. A mission planned with both
 * narration and thumbnail generation lost one of them from its own graph.
 *
 * **It was not predictable.** Built-in workflows set `key: 'script'` explicitly;
 * a mission planned by the Manager gets its steps from a model, sets no key, and
 * so the script step was keyed `write` and the fact check `factcheck`. Anything
 * looking for `previousOutputs.script` — which is what every script consumer
 * used to do — found nothing, in every AI-planned mission. That is why this only
 * ever failed in production: every test builds missions from workflow
 * definitions, where the key is set by hand.
 *
 * Derivation now uses the whole capability, so distinct capabilities cannot
 * collide, and a counter guarantees uniqueness even when the same capability
 * appears twice in one plan.
 */
export function assignStepKeys(steps: { capability: string; key?: string }[]): string[] {
  const used = new Set<string>();
  return steps.map((step, index) => {
    const base =
      step.key ?? step.capability.replace(/[^a-z0-9]+/gi, '_').toLowerCase() ?? `step_${index}`;
    if (!used.has(base)) {
      used.add(base);
      return base;
    }
    // The same capability twice in one plan — legitimate, e.g. two revisions.
    let suffix = 2;
    while (used.has(`${base}_${suffix}`)) suffix += 1;
    const unique = `${base}_${suffix}`;
    used.add(unique);
    return unique;
  });
}

export async function createMission(
  store: DataStore,
  input: CreateMissionInput,
): Promise<CreatedMission> {
  const workflow = input.workflowKey
    ? await resolveWorkflow(store, input.ownerId, input.workflowKey)
    : undefined;
  // Built-in workflows are code (`WORKFLOW_DEFINITIONS`), never rows in
  // `workflow_definitions` — see `lib/workspace/provision.ts`. Only a
  // genuinely custom, database-defined workflow has a real row behind it.
  const isCustomWorkflow = workflow ? !WORKFLOW_DEFINITIONS.includes(workflow) : false;
  const planned =
    input.steps && input.steps.length > 0
      ? input.steps
      : workflow
        ? stepsFromWorkflow(workflow.steps)
        : [];

  if (planned.length === 0 && !input.allowNoSteps) {
    throw new Error('A mission needs at least one step.');
  }

  // The planner-level fix for the bug this exists to prevent: a business
  // capability with no business behind it used to fail three layers down,
  // inside that capability's own persist(), as an opaque `MissingRelationship`.
  // Catching it here means it never gets that far — the mission is never
  // created, and every offending step is named at once rather than discovered
  // one task-failure at a time.
  const missingBusiness = businessCapabilitiesWithoutBusiness(
    planned.map((step) => step.capability),
    input.businessId,
  );
  if (missingBusiness.length > 0) {
    throw new ScopeViolation(missingBusiness, `Cannot create mission "${input.title}"`);
  }

  const timestamp = new Date().toISOString();
  const mission: Mission = {
    id: uuid(),
    owner_id: input.ownerId,
    business_id: input.businessId,
    parent_mission_id: input.parentMissionId ?? null,
    number: await nextMissionNumber(store, input.ownerId),
    title: input.title,
    objective: input.objective,
    status: 'planning',
    priority: input.priority ?? 'normal',
    // Deadlines are never inferred. They exist only when the operator asked for
    // one, or their instruction named a date the Manager could read.
    target_date: input.targetDate ?? null,
    target_time: input.targetTime ?? null,
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
  const stepKeys = assignStepKeys(planned);
  for (const [index, step] of planned.entries()) {
    const agentId = await resolveAgentForCapability(
      store,
      input.ownerId,
      step.capability,
      input.businessId,
    );
    const stepKey = stepKeys[index]!;
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
      // A built-in workflow's `id` is a deterministic hash (`stableId`), not a
      // database row — writing it here is exactly the bug `workflow_key`
      // exists to end (migration 0011). Only a genuinely custom workflow,
      // which is a real `workflow_definitions` row, satisfies that foreign
      // key, so only that case gets one.
      workflow_definition_id: isCustomWorkflow ? workflow.id : null,
      workflow_key: workflow.key,
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

/**
 * Status and progress for a pure orchestrator mission — one with no tasks of
 * its own, whose entire job is waiting on its children (e.g. Operational
 * Readiness waiting on one readiness mission per business).
 *
 * Deliberately mirrors `deriveMissionState`'s vocabulary and priority order —
 * a mission is a mission whether its units of work are tasks or child
 * missions — a failed child fails the parent, and the parent is not
 * `completed` until every child has genuinely finished.
 */
export function deriveParentMissionState(children: Mission[]): {
  status: MissionStatus;
  progress: number;
} {
  if (children.length === 0) return { status: 'planning', progress: 0 };

  const progress = Math.round(
    children.reduce((sum, c) => sum + c.progress, 0) / children.length,
  );

  let status: MissionStatus;
  if (children.some((c) => c.status === 'failed')) status = 'failed';
  else if (children.every((c) => c.status === 'completed' || c.status === 'cancelled')) {
    status = children.some((c) => c.status === 'completed') ? 'completed' : 'cancelled';
  } else if (children.some((c) => c.status === 'needs_approval')) status = 'needs_approval';
  else if (children.some((c) => c.status === 'running' || c.status === 'planning')) status = 'running';
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

  // A mission with no tasks of its own is either brand new or a pure
  // orchestrator — the two are told apart by whether it has children.
  const children =
    tasks.length === 0
      ? await store.list('missions', { where: { parent_mission_id: missionId } })
      : [];
  const { status, progress } =
    tasks.length === 0 && children.length > 0
      ? deriveParentMissionState(children)
      : deriveMissionState(tasks);
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

  // A system mission whose children just finished gets its report built once,
  // right here — the one place every child's completion, in any order,
  // through any path (a direct run or a retry), ends up. Dynamically
  // imported so this generic engine file does not depend on
  // readiness-specific business logic, the same way `lib/workflows/approvals.ts`
  // reaches into `lib/islamic/resolve.ts` without a static import cycle.
  if (
    (status === 'completed' || status === 'failed') &&
    mission.status !== status &&
    children.length > 0 &&
    mission.context.kind === 'operational_readiness'
  ) {
    const { finalizeReadinessReport } = await import('./readiness');
    await finalizeReadinessReport(store, updated).catch(() => null);
  }

  // Propagate up: a child's own status just changed, so whatever it belongs
  // to may need recomputing too. Recursive rather than one level deep, so a
  // deeper hierarchy would still work, though nothing builds one today.
  if (mission.parent_mission_id) {
    await recomputeMission(store, mission.parent_mission_id);
  }

  return updated;
}
