import 'server-only';
import { uuid } from '@/lib/ids';
import type { DataStore } from '@/lib/db/tables';
import { logActivity } from '@/lib/agents/activity';
import { runAgent, type RunAgentResult } from '@/lib/agents/engine';
import { resolveAgentForCapability, recomputeMission } from '@/lib/workflows/engine';
import type { Task } from '@/types/domain';

export interface RunCapabilityInput {
  ownerId: string;
  businessId: string | null;
  missionId?: string | null;
  capability: string;
  title: string;
  description?: string;
  input?: Record<string, unknown>;
}

export interface RunCapabilityResult {
  ok: boolean;
  task: Task | null;
  result: RunAgentResult | null;
  error: string | null;
}

/**
 * Creates a one-off task for a capability and runs it through the shared agent
 * engine.
 *
 * Every operator action that needs an agent — retry this scene, regenerate the
 * narration, replan the visuals — goes through here, so a manual action is
 * recorded, costed and logged exactly like a workflow step.
 */
export async function runCapabilityTask(
  store: DataStore,
  input: RunCapabilityInput,
): Promise<RunCapabilityResult> {
  const agentId = await resolveAgentForCapability(
    store,
    input.ownerId,
    input.capability,
    input.businessId,
  );
  if (!agentId) {
    return {
      ok: false,
      task: null,
      result: null,
      error: `No available agent provides "${input.capability}".`,
    };
  }

  const timestamp = new Date().toISOString();
  const task: Task = {
    id: uuid(),
    owner_id: input.ownerId,
    mission_id: input.missionId ?? null,
    business_id: input.businessId,
    agent_id: agentId,
    step_key: null,
    title: input.title,
    description: input.description ?? '',
    status: 'queued',
    priority: 'normal',
    input: { capability: input.capability, ...(input.input ?? {}) },
    output: null,
    error: null,
    progress: 0,
    is_demo: false,
    created_at: timestamp,
    started_at: null,
    completed_at: null,
    due_at: null,
  };
  await store.insert('tasks', task);

  const result = await runAgent(store, input.ownerId, task.id);
  if (input.missionId) await recomputeMission(store, input.missionId);

  return {
    ok: result.status !== 'failed',
    task: await store.get('tasks', task.id),
    result,
    error: result.status === 'failed' ? result.error : null,
  };
}

/** Records a deliberate operator intervention in the activity log. */
export async function recordOperatorAction(
  store: DataStore,
  input: {
    ownerId: string;
    businessId?: string | null;
    missionId?: string | null;
    taskId?: string | null;
    message: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await logActivity(store, {
    ownerId: input.ownerId,
    businessId: input.businessId ?? null,
    missionId: input.missionId ?? null,
    taskId: input.taskId ?? null,
    kind: 'operator_action',
    message: input.message,
    metadata: input.metadata ?? {},
  });
}
