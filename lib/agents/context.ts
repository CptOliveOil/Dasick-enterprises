import type { DataStore } from '@/lib/db/tables';
import type {
  Agent,
  AgentMemory,
  Business,
  Mission,
  Task,
} from '@/types/domain';

export interface RunContext {
  store: DataStore;
  ownerId: string;
  agent: Agent;
  task: Task;
  mission: Mission | null;
  business: Business | null;
  memory: AgentMemory[];
  /**
   * Business Intelligence Memory, already rendered for a prompt: what this
   * business has produced before and how it performed.
   *
   * It lives on the context rather than being fetched inside each capability so
   * that every agent gets it automatically — including agents that do not exist
   * yet. An empty string when the business has no completed work, so a new
   * workspace does not carry a paragraph explaining that it knows nothing.
   */
  businessMemory: string;
  /** Outputs of completed tasks in the same mission, keyed by workflow step. */
  previousOutputs: Record<string, Record<string, unknown>>;
}

/**
 * Loads the memories that should be in an agent's prompt: everything important,
 * most recent first, capped so the prompt stays affordable.
 */
export async function loadRelevantMemory(
  store: DataStore,
  agent: Agent,
  /** The business this run is for. Memory from other businesses is excluded. */
  businessId: string | null = agent.business_id,
  limit = 12,
): Promise<AgentMemory[]> {
  if (agent.memory_access === 'none') return [];

  const rows = await store.list('agent_memory', {
    where: { agent_id: agent.id },
  });

  // `business` — the default — keeps one channel's learned preferences out of
  // another's prompt. Two YouTube channels under one account are different
  // audiences with different editorial rules; carrying insight across them
  // silently would be a quiet, hard-to-notice failure. Rows with no business
  // are agent-wide by construction and always apply.
  const scoped = (
    agent.memory_access === 'agent'
      ? rows
      : rows.filter((row) => row.business_id === null || row.business_id === businessId)
  ).filter(
    // A memory awaiting approval must not shape a run. That is the whole point
    // of the gate: a durable rule an agent wrote should not change the next
    // mission before the operator has seen it. Archived memories are likewise
    // kept for the record but no longer loaded.
    (row) => row.status === 'active',
  );

  return scoped
    .sort((a, b) => {
      // Pinned first. A pinned memory is the operator saying "this always
      // applies", which outranks the importance ordering.
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      if (b.importance !== a.importance) return b.importance - a.importance;
      return b.created_at.localeCompare(a.created_at);
    })
    .slice(0, limit);
}

export async function loadPreviousOutputs(
  store: DataStore,
  missionId: string | null,
  excludeTaskId: string,
): Promise<Record<string, Record<string, unknown>>> {
  if (!missionId) return {};
  const tasks = await store.list('tasks', { where: { mission_id: missionId } });
  const outputs: Record<string, Record<string, unknown>> = {};
  for (const task of tasks) {
    if (task.id === excludeTaskId) continue;
    if (!task.output) continue;
    const key = task.step_key ?? task.id;
    outputs[key] = task.output;
  }
  return outputs;
}

/** Renders memory as prompt text. Empty string when the agent has none. */
export function renderMemory(memory: AgentMemory[]): string {
  if (memory.length === 0) return '';
  const lines = memory.map((m) => `- (${m.type}, importance ${m.importance}) ${m.content}`);
  return [
    'Things you have learned about this business. Treat these as established unless the task contradicts them:',
    ...lines,
  ].join('\n');
}

export function renderBusiness(business: Business | null): string {
  if (!business) return 'This task is not scoped to a single business.';
  return [
    `Business: ${business.name} (${business.kind})`,
    business.description,
    `Currency: ${business.currency}`,
  ].join('\n');
}

export function renderPreviousOutputs(
  outputs: Record<string, Record<string, unknown>>,
): string {
  const keys = Object.keys(outputs);
  if (keys.length === 0) return '';
  const parts = keys.map((key) => {
    const json = JSON.stringify(outputs[key], null, 2);
    // Upstream outputs can be large; a hard cap keeps prompts predictable.
    const body = json.length > 12_000 ? `${json.slice(0, 12_000)}\n… (truncated)` : json;
    return `### Output of step "${key}"\n${body}`;
  });
  return ['Work completed earlier in this mission:', ...parts].join('\n\n');
}
