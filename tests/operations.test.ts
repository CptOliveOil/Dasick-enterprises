import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMission } from '@/lib/workflows/engine';
import { runAgent } from '@/lib/agents/engine';
import { resolveApproval } from '@/lib/workflows/approvals';
import { loadRelevantMemory } from '@/lib/agents/context';
import { buildNeedsYou, approvalOutcomes, explainApproval } from '@/lib/operations/needs-you';
import {
  agentWorkloads,
  deadlineState,
  summariseToday,
  workloadBand,
  WORKLOAD_THRESHOLDS,
} from '@/lib/operations/today';
import { quickCommands } from '@/lib/operations/quick-commands';
import { buildDigest } from '@/lib/operations/digest';
import { isPubliclyExposedDemo } from '@/lib/operations/deployment';
import { newMemory, requiresApproval } from '@/lib/agents/memory-factory';
import { recordAgentMemory } from '@/lib/agents/memory-gate';
import { dailyBriefingSchema, recommendationsSchema } from '@/schemas/manager-ops';
import { managerBriefing, managerRecommendations } from '@/lib/agents/operations';
import { needsResolution, outcomeOf, scriptCarriesDifferenceContext } from '@/types/islamic';
import { makeAgent, makeBusiness, makeIslamicWorkspace, makeWorkspace, OWNER_ID } from './helpers';
import { uuid } from '@/lib/ids';
import type { Approval, Mission, Task } from '@/types/domain';

beforeEach(() => {
  vi.stubEnv('ANTHROPIC_API_KEY', '');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
});

/* ------------------------------------------------------------------ */
/* Needs you                                                           */
/* ------------------------------------------------------------------ */

function approval(overrides: Partial<Approval> = {}): Approval {
  return {
    id: uuid(),
    owner_id: OWNER_ID,
    business_id: null,
    mission_id: null,
    task_id: null,
    agent_id: null,
    kind: 'script',
    title: 'Approve script',
    summary: 'Ready.',
    payload: {},
    status: 'pending',
    feedback: null,
    is_demo: false,
    created_at: new Date().toISOString(),
    resolved_at: null,
    ...overrides,
  };
}

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: uuid(),
    owner_id: OWNER_ID,
    mission_id: null,
    business_id: null,
    agent_id: uuid(),
    step_key: 'step',
    title: 'A task',
    description: '',
    status: 'queued',
    priority: 'normal',
    input: {},
    output: null,
    error: null,
    progress: 0,
    is_demo: false,
    created_at: new Date().toISOString(),
    started_at: null,
    completed_at: null,
    due_at: null,
    claimed_at: null,
    heartbeat_at: null,
    reclaim_count: 0,
    ...overrides,
  };
}

describe('needs-you aggregation', () => {
  it('counts exactly the things that genuinely need a person', () => {
    const pending = approval();
    const resolved = approval({ status: 'approved' });
    const failed = task({ status: 'failed', error: 'The step failed.' });
    const running = task({ status: 'running' });

    const items = buildNeedsYou({
      businesses: [],
      agents: [],
      missions: [],
      tasks: [failed, running],
      approvals: [pending, resolved],
    });

    // One approval, one failure. Not the resolved approval, not the running task.
    expect(items).toHaveLength(2);
    expect(items.some((item) => item.id === `approval:${pending.id}`)).toBe(true);
    expect(items.some((item) => item.id === `task:${failed.id}`)).toBe(true);
  });

  it('surfaces a task nobody can run, because that is a decision not a retry', () => {
    const orphan = task({
      agent_id: null,
      error: 'No available agent provides "islamic.research".',
    });
    const items = buildNeedsYou({
      businesses: [],
      agents: [],
      missions: [],
      tasks: [orphan],
      approvals: [],
    });
    expect(items).toHaveLength(1);
    expect(items[0]!.kind).toBe('stalled_task');
    expect(items[0]!.href).toBe('/agents');
  });

  it('recognises a missing provider as its own kind', () => {
    const items = buildNeedsYou({
      businesses: [],
      agents: [],
      missions: [],
      tasks: [
        task({
          status: 'failed',
          error: 'No voice provider is connected. Set VOICE_PROVIDER.',
        }),
      ],
      approvals: [],
    });
    expect(items[0]!.kind).toBe('provider_required');
    expect(items[0]!.explanation).toMatch(/nothing was faked/i);
  });

  it('ignores failures inside missions that are already finished', () => {
    const mission: Mission = {
      id: uuid(),
      owner_id: OWNER_ID,
      business_id: null,
      parent_mission_id: null,
      number: 1,
      title: 'Done',
      objective: '',
      status: 'cancelled',
      priority: 'normal',
      target_date: null,
      target_time: null,
      workflow_definition_id: null,
      context: {},
      progress: 100,
      is_demo: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      completed_at: null,
    };
    const items = buildNeedsYou({
      businesses: [],
      agents: [],
      missions: [mission],
      tasks: [task({ status: 'failed', mission_id: mission.id, error: 'x' })],
      approvals: [],
    });
    expect(items).toHaveLength(0);
  });

  it('ranks critical missions and stale approvals above routine ones', () => {
    const critical: Mission = {
      ...({} as Mission),
      id: uuid(),
      owner_id: OWNER_ID,
      business_id: null,
      number: 2,
      title: 'Urgent',
      objective: '',
      status: 'needs_approval',
      priority: 'critical',
      target_date: null,
      target_time: null,
      workflow_definition_id: null,
      context: {},
      progress: 10,
      is_demo: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      completed_at: null,
    };
    const items = buildNeedsYou({
      businesses: [],
      agents: [],
      missions: [critical],
      tasks: [],
      approvals: [
        approval({ kind: 'idea', created_at: new Date().toISOString() }),
        approval({ mission_id: critical.id }),
        approval({
          kind: 'idea',
          created_at: new Date(Date.now() - 3 * 86_400_000).toISOString(),
        }),
      ],
    });
    expect(items[0]!.urgency).toBe('critical');
    expect(items[1]!.urgency).toBe('high');
  });

  it('never offers a one-click approve for source or spend gates', () => {
    const items = buildNeedsYou({
      businesses: [],
      agents: [],
      missions: [],
      tasks: [],
      approvals: [approval({ kind: 'source' }), approval({ kind: 'spend' }), approval()],
    });
    const bySource = items.find((item) => item.approvalKind === 'source')!;
    const bySpend = items.find((item) => item.approvalKind === 'spend')!;
    const byScript = items.find((item) => item.approvalKind === 'script')!;
    expect(bySource.inlineDecision).toBe(false);
    expect(bySpend.inlineDecision).toBe(false);
    expect(byScript.inlineDecision).toBe(true);
  });

  it('explains every approval kind in plain language, with outcomes', () => {
    for (const kind of [
      'script',
      'source',
      'video',
      'spend',
      'publish',
      'memory',
      'idea',
    ] as const) {
      expect(explainApproval(approval({ kind })).length).toBeGreaterThan(20);
      expect(approvalOutcomes(kind).approve.length).toBeGreaterThan(5);
      expect(approvalOutcomes(kind).reject.length).toBeGreaterThan(5);
    }
  });
});

/* ------------------------------------------------------------------ */
/* Today, workload, deadlines                                          */
/* ------------------------------------------------------------------ */

describe('today', () => {
  it('reports unknown as null rather than zero', () => {
    const summary = summariseToday({ tasks: [], transactions: [], currency: 'GBP' });
    // No videos or ideas were passed in at all — that is unknown, not none.
    expect(summary.videosCompleted).toBeNull();
    expect(summary.ideasGenerated).toBeNull();
    // But spend is ours to record, so zero is a real answer.
    expect(summary.aiSpend).toBe(0);
  });

  it('counts only today', () => {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString();
    const summary = summariseToday({
      tasks: [
        task({ status: 'completed', completed_at: new Date().toISOString() }),
        task({ status: 'completed', completed_at: yesterday }),
        task({ status: 'failed', completed_at: new Date().toISOString() }),
      ],
      transactions: [],
      currency: 'GBP',
    });
    expect(summary.completed).toBe(1);
    expect(summary.failed).toBe(1);
  });
});

describe('agent workload', () => {
  it('uses deterministic thresholds, not estimates', () => {
    expect(workloadBand(0)).toBe('idle');
    expect(workloadBand(1)).toBe('light');
    expect(workloadBand(WORKLOAD_THRESHOLDS.busy)).toBe('busy');
    expect(workloadBand(WORKLOAD_THRESHOLDS.overloaded - 1)).toBe('busy');
    expect(workloadBand(WORKLOAD_THRESHOLDS.overloaded)).toBe('overloaded');
    expect(workloadBand(50)).toBe('overloaded');
  });

  it('counts a real agent’s live work', () => {
    const agent = makeAgent({ capabilities: ['seo.keywords'] });
    const workloads = agentWorkloads(
      [agent],
      [
        task({ agent_id: agent.id, status: 'running' }),
        task({ agent_id: agent.id, status: 'queued' }),
        task({ agent_id: agent.id, status: 'waiting' }),
        task({ agent_id: agent.id, status: 'completed', completed_at: new Date().toISOString() }),
        task({ agent_id: uuid(), status: 'running' }),
      ],
      [],
    );
    expect(workloads[0]!.active).toBe(3);
    expect(workloads[0]!.band).toBe('busy');
    expect(workloads[0]!.completedToday).toBe(1);
  });
});

describe('mission deadlines', () => {
  const base = { status: 'running' as const, target_time: null };

  it('says nothing when there is no deadline', () => {
    expect(deadlineState({ ...base, target_date: null })).toBe('none');
  });

  it('reports overdue only once the date has actually passed', () => {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const nextYear = new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10);
    expect(deadlineState({ ...base, target_date: yesterday })).toBe('overdue');
    expect(deadlineState({ ...base, target_date: nextYear })).toBe('on_track');
  });

  it('calls a stalled mission at risk near its deadline, and nothing else', () => {
    const tomorrow = new Date(Date.now() + 20 * 3_600_000).toISOString().slice(0, 10);
    // Progressing normally: no prediction is made about whether it will finish.
    expect(deadlineState({ ...base, target_date: tomorrow })).toBe('on_track');
    // Waiting on a person with a day left: that will not move by itself.
    expect(
      deadlineState({ status: 'needs_approval', target_time: null, target_date: tomorrow }),
    ).toBe('at_risk');
  });

  it('ignores deadlines on finished missions', () => {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    expect(
      deadlineState({ status: 'completed', target_time: null, target_date: yesterday }),
    ).toBe('none');
  });
});

/* ------------------------------------------------------------------ */
/* Quick commands                                                      */
/* ------------------------------------------------------------------ */

describe('quick commands', () => {
  it('suggests only things true of the current state', () => {
    const business = makeBusiness({ name: 'History Channel' });
    const suggestions = quickCommands({
      businesses: [business],
      missions: [],
      tasks: [],
      needsYou: [],
    });
    // No missions, so nothing about continuing or blocked missions.
    expect(suggestions.some((s) => /continue/i.test(s.label))).toBe(false);
    expect(suggestions.some((s) => /blocked/i.test(s.label))).toBe(false);
    // But it names a channel the operator actually has.
    expect(suggestions.some((s) => s.label.includes('History Channel'))).toBe(true);
  });

  it('names the actual blocked mission number', () => {
    const mission = {
      id: uuid(),
      number: 12,
      title: 'Produce a video',
      status: 'failed',
      business_id: null,
    } as unknown as Mission;
    const suggestions = quickCommands({
      businesses: [],
      missions: [mission],
      tasks: [],
      needsYou: [],
    });
    expect(suggestions.some((s) => s.label.includes('#012'))).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Briefing grounded in state                                          */
/* ------------------------------------------------------------------ */

describe('daily briefing', () => {
  it('builds a digest from real records only', async () => {
    const { store, business } = await makeWorkspace();
    await createMission(store, {
      ownerId: OWNER_ID,
      businessId: business.id,
      title: 'Write a script',
      objective: 'Test',
      workflowKey: 'youtube_script',
      priority: 'high',
    });

    const { digest } = await buildDigest(store, OWNER_ID);
    expect(digest.businesses).toHaveLength(1);
    expect(digest.businesses[0]!.name).toBe(business.name);
    expect(digest.missions[0]!.priority).toBe('high');
    // A business with no revenue rows reports unknown, not zero.
    expect(digest.businesses[0]!.revenueThisMonth).toBeNull();
  });

  it('puts the digest into the prompt and never calls a provider itself', async () => {
    const { store, business } = await makeWorkspace();
    const manager = makeAgent({
      name: 'Commander',
      slug: 'commander',
      business_id: null,
      capabilities: ['manager.briefing', 'manager.recommendations'],
    });
    await store.insert('agents', manager);

    const briefingTask = await store.insert(
      'tasks',
      task({
        agent_id: manager.id,
        business_id: business.id,
        title: 'Write the daily briefing',
        input: { capability: 'manager.briefing' },
      }),
    );

    const prompt = await managerBriefing.buildPrompt!({
      store,
      ownerId: OWNER_ID,
      agent: manager,
      task: briefingTask,
      mission: null,
      business,
      memory: [],
      businessMemory: '',
      previousOutputs: {},
    });

    // The grounding instruction is the whole safety property.
    expect(prompt).toMatch(/Do not mention anything that is not in the JSON/i);
    expect(prompt).toMatch(/genuinely unknown, not zero/i);
    expect(prompt).toContain(business.name);
  });

  it('runs through the ordinary engine and records a command message', async () => {
    const { store, business } = await makeWorkspace();
    const manager = makeAgent({
      name: 'Commander',
      slug: 'commander',
      business_id: null,
      capabilities: ['manager.briefing'],
    });
    await store.insert('agents', manager);

    const created = await store.insert(
      'tasks',
      task({
        agent_id: manager.id,
        business_id: business.id,
        title: 'Write the daily briefing',
        input: { capability: 'manager.briefing' },
      }),
    );

    const result = await runAgent(store, OWNER_ID, created.id);
    expect(result.status).toBe('completed');
    expect(result.output?.briefing).toBeTruthy();

    // Cost accounting applies to the Manager like anything else.
    const usage = await store.list('api_usage', { where: { owner_id: OWNER_ID } });
    expect(usage.length).toBeGreaterThan(0);

    const messages = await store.list('command_messages', { where: { owner_id: OWNER_ID } });
    expect(messages.some((message) => message.refs.briefing)).toBe(true);
  });

  it('gives recommendations nowhere to put generic advice', () => {
    // Every recommendation must carry a reason, an impact and a concrete
    // action; there is no free-text "thoughts" field to fill with padding.
    const parsed = recommendationsSchema.safeParse({
      recommendations: [{ title: 'Do better', urgency: 'high' }],
    });
    expect(parsed.success).toBe(false);

    expect(
      recommendationsSchema.safeParse({ recommendations: [], note: 'Nothing needs doing.' })
        .success,
    ).toBe(true);
  });

  it('requires a real summary in a briefing', () => {
    expect(dailyBriefingSchema.safeParse({ summary: 'Fine.' }).success).toBe(false);
    expect(
      dailyBriefingSchema.safeParse({
        summary: 'Two missions are progressing and one script is waiting for your approval.',
      }).success,
    ).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Memory approval                                                     */
/* ------------------------------------------------------------------ */

describe('memory approval', () => {
  it('gates durable agent-written rules, and nothing else', () => {
    expect(requiresApproval({ importance: 5, origin: 'agent', type: 'preference' })).toBe(true);
    expect(requiresApproval({ importance: 5, origin: 'agent', type: 'constraint' })).toBe(true);
    // High-importance observations are still observations.
    expect(requiresApproval({ importance: 5, origin: 'agent', type: 'insight' })).toBe(false);
    // Ordinary importance never gates, or the queue becomes noise.
    expect(requiresApproval({ importance: 3, origin: 'agent', type: 'preference' })).toBe(false);
    // The operator's own rules are not submitted to the operator.
    expect(requiresApproval({ importance: 5, origin: 'owner', type: 'constraint' })).toBe(false);
  });

  it('raises an approval and keeps the rule out of prompts until approved', async () => {
    const { store, business } = await makeWorkspace();
    const agent = makeAgent({
      name: 'Visual Director',
      slug: 'vd',
      business_id: business.id,
      capabilities: ['youtube.visual_plan'],
    });
    await store.insert('agents', agent);

    const { memory, approvalId } = await recordAgentMemory(store, {
      ownerId: OWNER_ID,
      agent,
      businessId: business.id,
      type: 'constraint',
      content: 'Do not use background music on this channel.',
      importance: 5,
      source: 'Learned during production',
    });

    expect(memory.status).toBe('pending');
    expect(approvalId).toBeTruthy();

    // The whole point: a pending rule cannot change the next mission.
    const before = await loadRelevantMemory(store, agent, business.id);
    expect(before).toHaveLength(0);

    await resolveApproval(store, OWNER_ID, approvalId!, 'approve');

    const after = await loadRelevantMemory(store, agent, business.id);
    expect(after.map((row) => row.content)).toContain(
      'Do not use background music on this channel.',
    );
  });

  it('archives rather than deletes a rejected rule', async () => {
    const { store, business } = await makeWorkspace();
    const agent = makeAgent({ business_id: business.id, capabilities: ['youtube.visual_plan'] });
    await store.insert('agents', agent);

    const { memory, approvalId } = await recordAgentMemory(store, {
      ownerId: OWNER_ID,
      agent,
      businessId: business.id,
      type: 'preference',
      content: 'Always keep videos under eight minutes.',
      importance: 5,
      source: 'Learned',
    });

    await resolveApproval(store, OWNER_ID, approvalId!, 'reject');
    const stored = await store.get('agent_memory', memory.id);
    expect(stored).toBeTruthy();
    expect(stored!.status).toBe('archived');
  });

  it('loads pinned memories first', async () => {
    const { store, business } = await makeWorkspace();
    const agent = makeAgent({ business_id: business.id, capabilities: ['seo.keywords'] });
    await store.insert('agents', agent);

    await store.insertMany('agent_memory', [
      newMemory({
        agent_id: agent.id,
        business_id: business.id,
        content: 'Important but unpinned.',
        importance: 5,
      }),
      newMemory({
        agent_id: agent.id,
        business_id: business.id,
        content: 'Pinned and unimportant.',
        importance: 1,
        pinned: true,
      }),
    ]);

    const loaded = await loadRelevantMemory(store, agent, business.id);
    expect(loaded[0]!.content).toBe('Pinned and unimportant.');
  });
});

/* ------------------------------------------------------------------ */
/* Source resolution                                                   */
/* ------------------------------------------------------------------ */

describe('NEEDS_SOURCE resolution gate', () => {
  it('is a resolution state, not a failure and not a block', () => {
    expect(outcomeOf('NEEDS_SOURCE')).toBe('resolve');
    expect(needsResolution('NEEDS_SOURCE')).toBe(true);
    expect(outcomeOf('INCORRECT')).toBe('block');
    expect(outcomeOf('QUESTIONABLE')).toBe('block');
    expect(outcomeOf('VERIFIED')).toBe('continue');
    expect(outcomeOf('ACCEPTABLE_WITH_CONTEXT')).toBe('note');
  });

  it('raises a source approval and does not fail the task', async () => {
    const { store, islamicBusiness, islamicAgents } = await makeIslamicWorkspace();
    const { mission, tasks } = await createMission(store, {
      ownerId: OWNER_ID,
      businessId: islamicBusiness.id,
      title: 'Islamic research',
      objective: 'Research',
      workflowKey: 'islamic_research',
    });
    const checkTask = tasks.find((t) => t.step_key === 'source_check')!;
    const { islamicSourceVerify } = await import('@/lib/agents/islamic');

    const result = await islamicSourceVerify.persist!(
      {
        store,
        ownerId: OWNER_ID,
        agent: (await store.get('agents', islamicAgents.checker.id))!,
        task: checkTask,
        mission,
        business: islamicBusiness,
        memory: [],
        businessMemory: '',
        previousOutputs: {},
      },
      {
        summary: 'One narration cannot be placed in a named collection.',
        findings: [
          {
            claim: 'It is narrated from the Prophet that…',
            location: 'Evidence 1',
            category: 'OTHER_HADITH',
            status: 'NEEDS_SOURCE',
            explanation: 'No collection or reference is given.',
            correction: null,
            required_action: 'Supply a reference.',
          },
        ],
        outstanding: [],
        policy_violations: [],
      },
    );

    // Not blocked, not failed — an approval that pauses the mission.
    expect(result.blocked).toBeUndefined();
    expect(result.approval).toBeTruthy();
    expect(result.approval!.kind).toBe('source');
    expect(result.approval!.payload.claims).toBe(1);

    const records = await store.list('source_resolutions', { where: { owner_id: OWNER_ID } });
    expect(records).toHaveLength(1);
    expect(records[0]!.items[0]!.status).toBe('unresolved');
  });

  it('refuses to close the gate while a claim is unresolved', async () => {
    const { store, islamicBusiness } = await makeIslamicWorkspace();
    const record = await store.insert('source_resolutions', {
      id: uuid(),
      owner_id: OWNER_ID,
      business_id: islamicBusiness.id,
      source_check_id: null,
      script_id: null,
      video_id: null,
      mission_id: null,
      task_id: null,
      approval_id: null,
      items: [
        {
          id: uuid(),
          claim: 'A claim',
          reason: 'No reference.',
          current_source: null,
          location: null,
          category: 'UNVERIFIED' as const,
          status: 'unresolved' as const,
          action: null,
          resolved_source: null,
          edited_claim: null,
          override_reason: null,
          resolved_by: null,
          resolved_at: null,
        },
      ],
      status: 'open' as const,
      is_demo: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const gate = await store.insert(
      'approvals',
      approval({
        kind: 'source',
        business_id: islamicBusiness.id,
        payload: { resolution_id: record.id },
      }),
    );

    await expect(resolveApproval(store, OWNER_ID, gate.id, 'approve')).rejects.toThrow(
      /still ha(?:s|ve) no source/i,
    );

    // Settling it — here by overriding — lets the gate close.
    await store.update('source_resolutions', record.id, {
      items: [
        {
          ...record.items[0]!,
          status: 'overridden',
          action: 'override',
          override_reason: 'Widely known; will caption as unverified.',
          resolved_by: OWNER_ID,
          resolved_at: new Date().toISOString(),
        },
      ],
    });

    const second = await store.insert(
      'approvals',
      approval({
        kind: 'source',
        business_id: islamicBusiness.id,
        payload: { resolution_id: record.id },
      }),
    );
    const resolved = await resolveApproval(store, OWNER_ID, second.id, 'approve');
    expect(resolved.approval.status).toBe('approved');
  });

  it('records who overrode a claim, when, and why', async () => {
    const { store, islamicBusiness } = await makeIslamicWorkspace();
    const itemId = uuid();
    const record = await store.insert('source_resolutions', {
      id: uuid(),
      owner_id: OWNER_ID,
      business_id: islamicBusiness.id,
      source_check_id: null,
      script_id: null,
      video_id: null,
      mission_id: null,
      task_id: null,
      approval_id: null,
      items: [
        {
          id: itemId,
          claim: 'A widely-circulated narration.',
          reason: 'Cannot be placed.',
          current_source: null,
          location: null,
          category: 'UNVERIFIED' as const,
          status: 'unresolved' as const,
          action: null,
          resolved_source: null,
          edited_claim: null,
          override_reason: null,
          resolved_by: null,
          resolved_at: null,
        },
      ],
      status: 'open' as const,
      is_demo: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // The route's own logic, exercised through the store the same way.
    const overridden = {
      ...record.items[0]!,
      status: 'overridden' as const,
      action: 'override' as const,
      override_reason: 'Will be captioned as unverified on screen.',
      resolved_by: OWNER_ID,
      resolved_at: new Date().toISOString(),
    };
    await store.update('source_resolutions', record.id, { items: [overridden] });

    const { auditIslamicSources } = await import('@/lib/islamic/audit');
    const audit = await auditIslamicSources(store, OWNER_ID, {
      businessId: islamicBusiness.id,
      videoId: null,
      scriptId: null,
      missionId: null,
    });
    // No video/script/mission link, so this record is not in scope — the audit
    // scopes strictly rather than sweeping up every override on the account.
    expect(audit.overrides).toHaveLength(0);

    const linked = await store.update('source_resolutions', record.id, {
      mission_id: 'bc3f8bcb-a854-47b1-8886-b59aa842c80c',
    });
    expect(linked.items[0]!.resolved_by).toBe(OWNER_ID);
    expect(linked.items[0]!.override_reason).toBeTruthy();
    expect(linked.items[0]!.resolved_at).toBeTruthy();
  });

  it('surfaces overrides as a warning and unresolved claims as a failure', async () => {
    const { islamicQualityIssues } = await import('@/lib/islamic/audit');
    const issues = islamicQualityIssues({
      applies: true,
      quranReferences: 3,
      hadithReferences: 2,
      scholarlyPoints: 0,
      historicalPoints: 0,
      unresolvedNeedsSource: 1,
      questionable: 0,
      incorrect: 0,
      differences: 0,
      overrides: [{ claim: 'A claim', reason: 'Because', resolvedAt: null, resolvedBy: null }],
      checks: [],
      resolutions: [],
    });

    const unsourced = issues.find((issue) => issue.code === 'islamic_unsourced_claims')!;
    const override = issues.find((issue) => issue.code === 'islamic_overridden_claims')!;
    expect(unsourced.severity).toBe('blocking');
    // An override was a deliberate, recorded decision — it warns, it does not
    // fail work the operator already signed off.
    expect(override.severity).toBe('warning');
    expect(override.message).toMatch(/without a verified source/i);
  });

  it('only lets a difference of opinion pass when the script says so', () => {
    expect(scriptCarriesDifferenceContext('Scholars differ on this point.')).toBe(true);
    expect(scriptCarriesDifferenceContext('There is a difference of opinion here.')).toBe(true);
    expect(scriptCarriesDifferenceContext('The ruling is simply this.')).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* Deployment safety                                                   */
/* ------------------------------------------------------------------ */

describe('public demo warning', () => {
  it('warns only on a real deployment with no authentication', () => {
    expect(
      isPubliclyExposedDemo({ demo: true, nodeEnv: 'production', hostname: 'cc.example.com' }),
    ).toBe(true);
  });

  it('stays quiet when authentication is configured', () => {
    expect(
      isPubliclyExposedDemo({ demo: false, nodeEnv: 'production', hostname: 'cc.example.com' }),
    ).toBe(false);
  });

  it('stays quiet locally, so the banner that matters is never ignored', () => {
    expect(
      isPubliclyExposedDemo({ demo: true, nodeEnv: 'development', hostname: 'localhost' }),
    ).toBe(false);
    expect(
      isPubliclyExposedDemo({ demo: true, nodeEnv: 'production', hostname: 'localhost' }),
    ).toBe(false);
    expect(
      isPubliclyExposedDemo({ demo: true, nodeEnv: 'production', hostname: '127.0.0.1' }),
    ).toBe(false);
  });
});
