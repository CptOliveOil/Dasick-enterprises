import 'server-only';
import { uuid } from '@/lib/ids';
import type { DataStore } from '@/lib/db/tables';
import type { Agent, AgentMemory } from '@/types/domain';
import { newMemory, requiresApproval } from './memory-factory';

/**
 * Records something an agent learned.
 *
 * Ordinary facts and observations land active and are used immediately. A
 * durable *rule* — "never use background music on this channel", "keep videos
 * under eight minutes" — is different in kind: it silently rewrites every
 * subsequent mission, and an operator who never saw it written would have no
 * way to explain why the workforce changed. Those land `pending` and raise an
 * approval, and `loadRelevantMemory` refuses to load anything pending.
 *
 * Deliberately narrow: requiring approval for every fact would produce a queue
 * nobody reads, which is the same as no gate at all.
 */
export async function recordAgentMemory(
  store: DataStore,
  input: {
    ownerId: string;
    agent: Agent;
    businessId: string | null;
    type: AgentMemory['type'];
    content: string;
    importance: number;
    source: string;
    taskId?: string | null;
    missionId?: string | null;
  },
): Promise<{ memory: AgentMemory; approvalId: string | null }> {
  const memory = newMemory({
    agent_id: input.agent.id,
    business_id: input.businessId,
    type: input.type,
    content: input.content,
    importance: input.importance,
    source: input.source,
    origin: 'agent',
  });
  await store.insert('agent_memory', memory);

  if (memory.status !== 'pending') return { memory, approvalId: null };

  const approval = await store.insert('approvals', {
    id: uuid(),
    owner_id: input.ownerId,
    business_id: input.businessId,
    mission_id: input.missionId ?? null,
    task_id: input.taskId ?? null,
    agent_id: input.agent.id,
    kind: 'memory',
    title: `${input.agent.name} wants to remember a rule`,
    summary: `"${input.content}" — this would apply to every future mission${
      input.businessId ? ' on this business' : ''
    }. It is not loaded into any run until you approve it.`,
    payload: {
      memory_id: memory.id,
      content: input.content,
      type: input.type,
      importance: input.importance,
      agent: input.agent.name,
    },
    status: 'pending',
    feedback: null,
    is_demo: false,
    created_at: new Date().toISOString(),
    resolved_at: null,
  });

  return { memory, approvalId: approval.id };
}

export { requiresApproval };
