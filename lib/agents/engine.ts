import 'server-only';
import { uuid } from '@/lib/ids';
import type { DataStore } from '@/lib/db/tables';
import {
  ProviderNotConnected,
  providerIsLive,
  resolveProvider,
} from '@/lib/integrations/ai';
import { checkAiSpend, estimateCallCost } from '@/lib/finance/ai-budget';
import { StructuredOutputError } from '@/lib/integrations/ai/types';
import type { Agent, Approval, Task } from '@/types/domain';
import { logActivity, notify } from './activity';
import { canPerform } from './authority';
import { getCapabilityHandler, type ApprovalRequest } from './capabilities';
import {
  loadPreviousOutputs,
  loadRelevantMemory,
  type RunContext,
} from './context';
import { businessMemoryBrief } from '@/lib/memory/business';

export interface RunAgentResult {
  taskId: string;
  status: Task['status'];
  summary: string;
  output: Record<string, unknown> | null;
  error: string | null;
  approvalId: string | null;
  blocked: string | null;
  simulated: boolean;
}

/**
 * The single agent execution path. Nothing else in the application calls an AI
 * provider — adding a capability means adding a handler, never duplicating this.
 *
 * Sequence: load → authorise → mark running → build prompt → call provider →
 * validate → persist → record usage → update stats → log → raise approval.
 */
export async function runAgent(
  store: DataStore,
  ownerId: string,
  taskId: string,
): Promise<RunAgentResult> {
  const task = await store.get('tasks', taskId);
  if (!task) throw new Error(`No task with id ${taskId}`);

  // Both of these are domain outcomes, not caller errors — `createMission`
  // already records why no agent was found, and an agent can be deleted out
  // from under a task that was created while it still existed. Failing the
  // task here, gracefully, is what makes this safe to call from inside a
  // `Promise.all` of unrelated missions: one mission's missing agent must
  // never throw an unhandled error that aborts every other mission still
  // running alongside it.
  if (!task.agent_id) {
    return failTaskOnly(
      store,
      ownerId,
      task,
      task.error ?? 'No agent is assigned to this task.',
    );
  }
  const agent = await store.get('agents', task.agent_id);
  if (!agent) {
    return failTaskOnly(store, ownerId, task, `Assigned agent ${task.agent_id} no longer exists.`);
  }

  if (agent.status === 'disabled' || agent.status === 'offline') {
    return fail(store, ownerId, task, agent, `${agent.name} is ${agent.status}.`);
  }

  // Producing work is a level-1 action. Refuse rather than silently proceeding.
  const decision = canPerform(agent.authority_level, 'draft');
  if (!decision.allowed) {
    return fail(store, ownerId, task, agent, decision.reason);
  }

  // A task may name the capability explicitly, which lets one agent hold
  // several (the Scriptwriter both drafts and revises). Otherwise the agent's
  // primary capability is used.
  const requested = task.input.capability;
  const capability =
    typeof requested === 'string' && agent.capabilities.includes(requested)
      ? requested
      : agent.capabilities[0];
  const handler = capability ? getCapabilityHandler(capability) : undefined;
  if (!handler) {
    return fail(
      store,
      ownerId,
      task,
      agent,
      `${agent.name} has no handler for capability "${capability ?? 'none'}".`,
    );
  }

  const startedAt = new Date().toISOString();
  await store.update('tasks', task.id, {
    status: 'running',
    started_at: task.started_at ?? startedAt,
    claimed_at: task.claimed_at ?? startedAt,
    heartbeat_at: startedAt,
    progress: 5,
    error: null,
  });
  await store.update('agents', agent.id, {
    status: 'working',
    current_task_id: task.id,
    updated_at: startedAt,
  });
  await logActivity(store, {
    ownerId,
    businessId: task.business_id,
    missionId: task.mission_id,
    taskId: task.id,
    agentId: agent.id,
    kind: 'agent_started',
    message: `${agent.name} started "${task.title}"`,
  });

  const began = Date.now();

  try {
    const ctx: RunContext = {
      store,
      ownerId,
      agent,
      task: { ...task, status: 'running' },
      mission: task.mission_id ? await store.get('missions', task.mission_id) : null,
      business: task.business_id ? await store.get('businesses', task.business_id) : null,
      memory: await loadRelevantMemory(store, agent, task.business_id ?? agent.business_id),
      businessMemory: await businessMemoryBrief(
        store,
        task.business_id ?? agent.business_id,
      ).catch(() => ''),
      previousOutputs: await loadPreviousOutputs(store, task.mission_id, task.id),
    };

    await store.update('tasks', task.id, { progress: 25, heartbeat_at: new Date().toISOString() });

    // A provider step calls a media provider or the renderer rather than an AI
    // model. It still runs here so authority, cost, logging and approvals are
    // handled in exactly one place.
    let persisted: Awaited<ReturnType<NonNullable<typeof handler.run>>>;
    let usage = { input_tokens: 0, output_tokens: 0, estimated_cost: 0 };
    let simulated = false;
    let repaired = false;

    if (handler.mode === 'provider') {
      if (!handler.run) {
        return fail(store, ownerId, task, agent, `"${capability}" has no provider implementation.`);
      }
      persisted = await handler.run(ctx);
      await store.update('tasks', task.id, { progress: 75, heartbeat_at: new Date().toISOString() });
    } else {
      if (!handler.buildPrompt || !handler.persist) {
        return fail(store, ownerId, task, agent, `"${capability}" has no prompt implementation.`);
      }
      const prompt = await handler.buildPrompt(ctx);
      // Throws in a real workspace when nothing is connected, rather than
      // quietly returning invented text. Caught below and reported as what it
      // is: a missing connection, not a failure of the work.
      const provider = resolveProvider(agent.provider);
      simulated = !providerIsLive(agent.provider);

      // Money is only at stake once the call actually reaches a model. A
      // simulated run costs nothing and is not gated, so Demo Mode needs no
      // budget at all.
      if (!simulated) {
        const decision = await checkAiSpend(store, ownerId, {
          estimate: estimateCallCost(agent.model, agent.max_tokens, prompt.length),
          missionId: task.mission_id,
        });
        if (!decision.allowed) {
          // An approval re-queues this same step with spending authorised for
          // it alone, using the gate the workflow engine already has. Anything
          // else is a ceiling, and a ceiling is not something approval can
          // override.
          if (decision.requiresApproval && task.input.spend_authorised !== true) {
            return spendGate(store, ownerId, task, agent, decision.reason);
          }
          if (!decision.requiresApproval) {
            return fail(store, ownerId, task, agent, decision.reason);
          }
        }
      }

      const result = await provider.generateStructured({
        system: agent.system_prompt,
        prompt,
        model: agent.model,
        temperature: agent.temperature,
        maxTokens: agent.max_tokens,
        schema: handler.schema,
        schemaName: handler.schemaName,
      });
      usage = result.usage;
      repaired = result.repaired;

      await store.update('tasks', task.id, { progress: 75, heartbeat_at: new Date().toISOString() });
      persisted = await handler.persist(ctx, result.data);
    }

    const durationMs = Date.now() - began;

    await recordUsage(store, ownerId, agent, task, usage, durationMs, handler.mode ?? 'ai');
    if (persisted.spend && persisted.spend.amount > 0) {
      await recordProviderSpend(store, ownerId, agent, task, persisted.spend);
    }

    // Touch the memories that shaped this run so stale ones are identifiable.
    for (const memory of ctx.memory) {
      await store.update('agent_memory', memory.id, { last_used_at: new Date().toISOString() });
    }

    // A handler can raise its own approval; a workflow step can also declare
    // one. Without this second case, `requires_approval` in a workflow
    // definition would be silently ignored.
    const stepApproval =
      task.input.requires_approval === true
        ? {
            kind: 'generic' as const,
            title: String(task.input.approval_label ?? task.title),
            summary: persisted.summary,
            payload: persisted.output,
          }
        : null;

    let approvalId: string | null = null;
    const approvalRequest = persisted.approval ?? stepApproval;
    if (approvalRequest && !persisted.blocked) {
      approvalId = await raiseApproval(store, ownerId, agent, task, approvalRequest);
    }

    const finishedAt = new Date().toISOString();
    const finalStatus: Task['status'] = persisted.blocked
      ? 'waiting'
      : approvalId
        ? 'approval'
        : 'completed';

    await store.update('tasks', task.id, {
      status: finalStatus,
      output: persisted.output,
      progress: 100,
      completed_at: finalStatus === 'completed' ? finishedAt : null,
      error: persisted.blocked ?? null,
    });

    const completed = agent.tasks_completed + 1;
    await store.update('agents', agent.id, {
      status: approvalId ? 'needs_approval' : persisted.blocked ? 'waiting' : 'idle',
      current_task_id: null,
      tasks_completed: completed,
      average_execution_time: Math.round(
        (agent.average_execution_time * agent.tasks_completed + durationMs) / completed,
      ),
      estimated_total_cost: Number(
        (
          agent.estimated_total_cost +
          usage.estimated_cost +
          (persisted.spend?.amount ?? 0)
        ).toFixed(6),
      ),
      last_run_at: finishedAt,
      updated_at: finishedAt,
    });

    await logActivity(store, {
      ownerId,
      businessId: task.business_id,
      missionId: task.mission_id,
      taskId: task.id,
      agentId: agent.id,
      kind: 'agent_completed',
      message: `${agent.name} ${persisted.summary}`,
      metadata: { simulated, repaired, duration_ms: durationMs },
    });

    return {
      taskId: task.id,
      status: finalStatus,
      summary: persisted.summary,
      output: persisted.output,
      error: persisted.blocked ?? null,
      approvalId,
      blocked: persisted.blocked ?? null,
      simulated,
    };
  } catch (error) {
    const message =
      error instanceof ProviderNotConnected
        ? error.message
        : error instanceof StructuredOutputError
          ? `${error.message}`
          : error instanceof Error
            ? error.message
            : 'Unknown error';
    return fail(store, ownerId, task, agent, message);
  }
}

/**
 * Stops a step for the operator because of what it would cost, without
 * spending anything.
 *
 * Deliberately the same shape as every other approval: the task waits, the
 * agent waits, and approving re-queues this exact step with spending
 * authorised for it alone. `resolveApproval` already understands that payload,
 * so there is no second path for money.
 */
async function spendGate(
  store: DataStore,
  ownerId: string,
  task: Task,
  agent: Agent,
  reason: string,
): Promise<RunAgentResult> {
  const timestamp = new Date().toISOString();
  const approvalId = await raiseApproval(store, ownerId, agent, task, {
    kind: 'spend',
    title: `Authorise spend — ${task.title}`,
    summary: reason,
    payload: { authorise_spend: true, task_id: task.id },
  });

  await store.update('tasks', task.id, {
    status: 'approval',
    progress: 0,
    error: reason,
  });
  await store.update('agents', agent.id, {
    status: 'needs_approval',
    current_task_id: null,
    updated_at: timestamp,
  });

  return {
    taskId: task.id,
    status: 'approval',
    summary: reason,
    output: {},
    error: null,
    approvalId,
    blocked: reason,
    simulated: false,
  };
}

async function fail(
  store: DataStore,
  ownerId: string,
  task: Task,
  agent: Agent,
  message: string,
): Promise<RunAgentResult> {
  const timestamp = new Date().toISOString();
  await store.update('tasks', task.id, {
    status: 'failed',
    error: message,
    completed_at: timestamp,
  });
  await store.update('agents', agent.id, {
    status: 'error',
    current_task_id: null,
    tasks_failed: agent.tasks_failed + 1,
    updated_at: timestamp,
  });
  await logActivity(store, {
    ownerId,
    businessId: task.business_id,
    missionId: task.mission_id,
    taskId: task.id,
    agentId: agent.id,
    kind: 'agent_failed',
    message: `${agent.name} failed "${task.title}" — ${message}`,
  });
  await notify(store, {
    ownerId,
    kind: 'agent_failed',
    title: `${agent.name} failed a task`,
    body: message,
    href: `/tasks/${task.id}`,
  });
  return {
    taskId: task.id,
    status: 'failed',
    summary: message,
    output: null,
    error: message,
    approvalId: null,
    blocked: null,
    simulated: false,
  };
}

/**
 * `fail()` without an agent — for the two cases where none exists to update:
 * no agent was ever assigned, or the one that was has since been deleted.
 */
async function failTaskOnly(
  store: DataStore,
  ownerId: string,
  task: Task,
  message: string,
): Promise<RunAgentResult> {
  const timestamp = new Date().toISOString();
  await store.update('tasks', task.id, {
    status: 'failed',
    error: message,
    completed_at: timestamp,
  });
  await logActivity(store, {
    ownerId,
    businessId: task.business_id,
    missionId: task.mission_id,
    taskId: task.id,
    agentId: null,
    kind: 'agent_failed',
    message: `"${task.title}" could not run — ${message}`,
  });
  await notify(store, {
    ownerId,
    kind: 'agent_failed',
    title: 'A task could not run',
    body: message,
    href: `/tasks/${task.id}`,
  });
  return {
    taskId: task.id,
    status: 'failed',
    summary: message,
    output: null,
    error: message,
    approvalId: null,
    blocked: null,
    simulated: false,
  };
}

async function recordUsage(
  store: DataStore,
  ownerId: string,
  agent: Agent,
  task: Task,
  usage: { input_tokens: number; output_tokens: number; estimated_cost: number },
  durationMs: number,
  mode: 'ai' | 'provider' = 'ai',
) {
  // A provider step consumes no tokens, so recording a zero-token AI row would
  // just be noise in the economics.
  if (mode === 'provider' && usage.input_tokens === 0 && usage.output_tokens === 0) return;

  const timestamp = new Date().toISOString();
  await store.insert('api_usage', {
    id: uuid(),
    owner_id: ownerId,
    business_id: task.business_id,
    agent_id: agent.id,
    task_id: task.id,
    provider: agent.provider,
    model: agent.model,
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
    estimated_cost: usage.estimated_cost,
    duration_ms: durationMs,
    is_demo: false,
    created_at: timestamp,
  });

  // Only record spend that actually happened — the mock provider costs nothing.
  if (usage.estimated_cost > 0) {
    await store.insert('financial_transactions', {
      id: uuid(),
      owner_id: ownerId,
      business_id: task.business_id,
      kind: 'ai_cost',
      category: agent.model,
      description: `${agent.name} — ${task.title}`,
      amount: usage.estimated_cost,
      currency: 'GBP',
      occurred_at: timestamp,
      reference_type: 'task',
      reference_id: task.id,
      is_demo: false,
      created_at: timestamp,
    });
  }
}

/** Media and rendering spend, attributed to the task that caused it. */
async function recordProviderSpend(
  store: DataStore,
  ownerId: string,
  agent: Agent,
  task: Task,
  spend: { amount: number; provider: string; product: string },
) {
  const timestamp = new Date().toISOString();
  await store.insert('financial_transactions', {
    id: uuid(),
    owner_id: ownerId,
    business_id: task.business_id,
    kind: 'ai_cost',
    category: `${spend.provider}:${spend.product}`,
    description: `${agent.name} — ${task.title}`,
    amount: spend.amount,
    currency: 'GBP',
    occurred_at: timestamp,
    reference_type: 'task',
    reference_id: task.id,
    is_demo: false,
    created_at: timestamp,
  });
}

async function raiseApproval(
  store: DataStore,
  ownerId: string,
  agent: Agent,
  task: Task,
  request: ApprovalRequest,
): Promise<string> {
  const approval: Approval = {
    id: uuid(),
    owner_id: ownerId,
    business_id: task.business_id,
    mission_id: task.mission_id,
    task_id: task.id,
    agent_id: agent.id,
    kind: request.kind,
    title: request.title,
    summary: request.summary,
    payload: request.payload,
    status: 'pending',
    feedback: null,
    is_demo: false,
    created_at: new Date().toISOString(),
    resolved_at: null,
  };
  await store.insert('approvals', approval);
  await logActivity(store, {
    ownerId,
    businessId: task.business_id,
    missionId: task.mission_id,
    taskId: task.id,
    agentId: agent.id,
    kind: 'approval_requested',
    message: `${agent.name} requested approval — ${request.title}`,
  });
  await notify(store, {
    ownerId,
    kind: 'approval_required',
    title: request.title,
    body: request.summary,
    href: '/approvals',
  });
  return approval.id;
}
