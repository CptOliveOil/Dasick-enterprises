import { uuid } from '@/lib/ids';
import { memoryBand, type AgentMemory } from '@/types/domain';

/**
 * One place that knows the shape of a memory row.
 *
 * The default `origin` is `agent`, because almost every memory is written by an
 * agent during a run and only a handful come from the operator. Defaulting the
 * other way would silently label AI-written rules as owner-written, which is
 * exactly the distinction the memory UI exists to make visible.
 */
export function newMemory(
  input: Partial<AgentMemory> & { agent_id: string; content: string },
): AgentMemory {
  const importance = input.importance ?? 3;
  return {
    id: uuid(),
    business_id: null,
    type: 'insight',
    importance,
    source: 'agent',
    origin: 'agent',
    // A high-importance agent-written rule starts life pending, so it cannot
    // shape a mission before the operator has seen it. Everything else is
    // active immediately — requiring approval for ordinary context would make
    // the gate meaningless.
    status: requiresApproval({ ...input, importance }) ? 'pending' : 'active',
    pinned: false,
    created_at: new Date().toISOString(),
    last_used_at: null,
    ...input,
  };
}

/**
 * Whether a memory an *agent* wants to record needs the operator's sign-off.
 *
 * The test is "would this change future missions on its own?". A durable rule —
 * "never use background music on this channel", "keep videos under eight
 * minutes" — silently rewrites every subsequent run, so it is worth a look. A
 * fact or a performance note is not.
 */
export function requiresApproval(
  memory: Pick<AgentMemory, 'importance'> & Partial<Pick<AgentMemory, 'origin' | 'type'>>,
): boolean {
  // The operator's own rules are not submitted for the operator's approval.
  if (memory.origin === 'owner') return false;
  if (memoryBand(memory.importance) !== 'high') return false;
  // High-importance *observations* are still just observations.
  return memory.type === 'preference' || memory.type === 'constraint';
}
