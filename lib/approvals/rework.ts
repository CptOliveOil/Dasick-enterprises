import 'server-only';
import { uuid } from '@/lib/ids';
import { resolveAgentForCapability } from '@/lib/workflows/engine';
import type { DataStore } from '@/lib/db/tables';
import type { Approval, ApprovalKind, Task } from '@/types/domain';

/**
 * Sending work back to the agent that produced it.
 *
 * "Request changes" used to re-queue the approval's own task. For a spend gate
 * that is right — the same step runs again with permission. For a script it was
 * quietly wrong: the approval is raised by the *fact checker*, so requesting a
 * rewrite re-ran the fact check against an unchanged draft and produced the
 * same warnings, and the operator's notes went to an agent that could not act
 * on them.
 *
 * A rework spec names the capability that can actually redo the work. When one
 * exists and some agent in the workspace provides it, a rework task is inserted
 * ahead of the original step, which then waits on it. The result is the
 * sequence an editor expects: notes → rewrite → re-check → review again, with
 * every draft kept.
 *
 * Registered per kind, so a business added later inherits the behaviour by
 * naming its own capability. Where no spec exists, or no agent provides the
 * capability, the previous behaviour stands exactly as it was — the step is
 * re-queued with the feedback attached. This can make a rework better; it can
 * never make one impossible.
 */

export interface ReworkSpec {
  /** The capability that redoes the work. */
  capability: string;
  title: (approval: Approval) => string;
  /**
   * What the rework task needs to find its subject. The operator's notes are
   * added by `scheduleRework` — a spec never has to remember them.
   */
  input: (approval: Approval) => Record<string, unknown>;
}

const SPECS: Partial<Record<ApprovalKind, ReworkSpec>> = {
  script: {
    capability: 'youtube.script.revise',
    title: () => 'Revise the script from the operator’s notes',
    input: (approval) => ({
      script_id: approval.payload.script_id,
      capability: 'youtube.script.revise',
    }),
  },
  research: {
    capability: 'youtube.research.package',
    title: () => 'Redo the research from the operator’s notes',
    input: (approval) => ({
      idea_id: approval.payload.idea_id,
      capability: 'youtube.research.package',
    }),
  },
  idea: {
    capability: 'youtube.research.ideas',
    title: () => 'Generate fresh ideas from the operator’s notes',
    input: () => ({ capability: 'youtube.research.ideas' }),
  },
};

export function reworkSpecFor(kind: ApprovalKind): ReworkSpec | null {
  return SPECS[kind] ?? null;
}

/** Test and extension seam: registers or replaces a spec for a kind. */
export function registerRework(kind: ApprovalKind, spec: ReworkSpec): void {
  SPECS[kind] = spec;
}

export interface ReworkResult {
  task: Task;
  /** The task that now waits on the rework, when there is one. */
  blockedTaskId: string | null;
}

/**
 * Queues the rework and makes the original step wait for it.
 *
 * Returns null when nothing was scheduled — no spec, no agent, no mission — and
 * the caller falls back to re-queueing the approval's own task.
 */
export async function scheduleRework(
  store: DataStore,
  ownerId: string,
  approval: Approval,
  feedback: string,
): Promise<ReworkResult | null> {
  const spec = reworkSpecFor(approval.kind);
  if (!spec || !approval.mission_id) return null;

  const agentId = await resolveAgentForCapability(
    store,
    ownerId,
    spec.capability,
    approval.business_id,
  );
  // No agent provides the capability. Scheduling a task nobody can run would
  // strand the mission, which is strictly worse than the old behaviour.
  if (!agentId) return null;

  const subject = spec.input(approval);
  // A rework with no subject to work on cannot be run either.
  const hasSubject = Object.entries(subject).some(
    ([key, value]) => key !== 'capability' && typeof value === 'string' && value.length > 0,
  );
  if (!hasSubject && approval.kind !== 'idea') return null;

  const timestamp = new Date().toISOString();
  const task: Task = {
    id: uuid(),
    owner_id: ownerId,
    mission_id: approval.mission_id,
    business_id: approval.business_id,
    agent_id: agentId,
    step_key: `rework_${approval.kind}_${approval.id.slice(0, 8)}`,
    title: spec.title(approval),
    description: 'Requested by the operator during review.',
    status: 'queued',
    priority: 'high',
    input: {
      ...subject,
      // Both names on purpose: `instruction` is what the revise capability
      // reads, `operator_feedback` is what every prompt appends as operator
      // notes. A capability that only knows one of them still gets the notes.
      instruction: feedback,
      operator_feedback: feedback,
      rework_of_approval_id: approval.id,
    },
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

  // The step that raised the approval runs again, but only once the rework has
  // landed — otherwise it would re-check the draft it already rejected.
  let blockedTaskId: string | null = null;
  if (approval.task_id) {
    const original = await store.get('tasks', approval.task_id).catch(() => null);
    if (original) {
      await store.update('tasks', original.id, {
        status: 'waiting',
        progress: 0,
        output: null,
        error: null,
        started_at: null,
        completed_at: null,
        input: { ...original.input, operator_feedback: feedback },
      });
      await store.insert('task_dependencies', {
        id: uuid(),
        task_id: original.id,
        depends_on_task_id: task.id,
      });
      blockedTaskId = original.id;
    }
  }

  return { task, blockedTaskId };
}
