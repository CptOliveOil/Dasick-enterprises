import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMission,
  getRunnableTasks,
  recomputeMission,
  releaseUnblockedTasks,
  resolveAgentForCapability,
} from '@/lib/workflows/engine';
import { runAgent } from '@/lib/agents/engine';
import { resolveApproval } from '@/lib/workflows/approvals';
import { runMission } from '@/lib/workflows/runner';
import { makeWorkspace, OWNER_ID } from './helpers';

// No provider key in tests, so every agent runs on the simulated provider —
// which still exercises validation, storage and workflow progression.
beforeEach(() => {
  vi.stubEnv('ANTHROPIC_API_KEY', '');
});

describe('capability resolution', () => {
  it('prefers an agent scoped to the business', async () => {
    const { store, business, agents } = await makeWorkspace();
    const resolved = await resolveAgentForCapability(
      store,
      OWNER_ID,
      'youtube.script.write',
      business.id,
    );
    expect(resolved).toBe(agents.writer.id);
  });

  it('never selects a disabled or offline agent', async () => {
    const { store, business, agents } = await makeWorkspace();
    await store.update('agents', agents.writer.id, { status: 'disabled' });
    const resolved = await resolveAgentForCapability(
      store,
      OWNER_ID,
      'youtube.script.write',
      business.id,
    );
    expect(resolved).toBeNull();
  });

  it('returns null for a capability nobody has', async () => {
    const { store, business } = await makeWorkspace();
    expect(
      await resolveAgentForCapability(store, OWNER_ID, 'nobody.has.this', business.id),
    ).toBeNull();
  });
});

describe('mission creation and dependencies', () => {
  it('queues only the steps with no unmet dependency', async () => {
    const { store, business } = await makeWorkspace();
    const { mission, tasks } = await createMission(store, {
      ownerId: OWNER_ID,
      businessId: business.id,
      title: 'Script a video',
      objective: 'Research, draft and verify a script.',
      workflowKey: 'youtube_script',
    });

    expect(mission.status).toBe('planning');
    expect(tasks).toHaveLength(3);

    const byStep = Object.fromEntries(tasks.map((t) => [t.step_key, t]));
    expect(byStep.research!.status).toBe('queued');
    expect(byStep.script!.status).toBe('waiting');
    expect(byStep.fact_check!.status).toBe('waiting');

    const runnable = await getRunnableTasks(store, mission.id);
    expect(runnable.map((t) => t.step_key)).toEqual(['research']);
  });

  it('records the dependency edges', async () => {
    const { store, business } = await makeWorkspace();
    const { mission } = await createMission(store, {
      ownerId: OWNER_ID,
      businessId: business.id,
      title: 'Script a video',
      objective: 'x',
      workflowKey: 'youtube_script',
    });
    const dependencies = await store.list('task_dependencies');
    const tasks = await store.list('tasks', { where: { mission_id: mission.id } });
    // script depends on research; fact_check depends on script.
    expect(dependencies).toHaveLength(2);
    for (const dependency of dependencies) {
      expect(tasks.some((t) => t.id === dependency.task_id)).toBe(true);
      expect(tasks.some((t) => t.id === dependency.depends_on_task_id)).toBe(true);
    }
  });

  it('numbers missions sequentially per operator', async () => {
    const { store, business } = await makeWorkspace();
    const first = await createMission(store, {
      ownerId: OWNER_ID,
      businessId: business.id,
      title: 'One',
      objective: 'x',
      workflowKey: 'youtube_ideas',
    });
    const second = await createMission(store, {
      ownerId: OWNER_ID,
      businessId: business.id,
      title: 'Two',
      objective: 'x',
      workflowKey: 'youtube_ideas',
    });
    expect(second.mission.number).toBe(first.mission.number + 1);
  });

  it('refuses to create a mission with no steps', async () => {
    const { store, business } = await makeWorkspace();
    await expect(
      createMission(store, {
        ownerId: OWNER_ID,
        businessId: business.id,
        title: 'Empty',
        objective: 'x',
        steps: [],
      }),
    ).rejects.toThrow();
  });

  it('releases a dependent step only once its dependency completes', async () => {
    const { store, business } = await makeWorkspace();
    const { mission, tasks } = await createMission(store, {
      ownerId: OWNER_ID,
      businessId: business.id,
      title: 'Script a video',
      objective: 'x',
      workflowKey: 'youtube_script',
    });
    const research = tasks.find((t) => t.step_key === 'research')!;

    expect(await releaseUnblockedTasks(store, mission.id)).toHaveLength(0);

    await store.update('tasks', research.id, { status: 'completed' });
    const released = await releaseUnblockedTasks(store, mission.id);
    expect(released.map((t) => t.step_key)).toEqual(['script']);
  });

  it('cancels downstream steps when an upstream step fails', async () => {
    const { store, business } = await makeWorkspace();
    const { mission, tasks } = await createMission(store, {
      ownerId: OWNER_ID,
      businessId: business.id,
      title: 'Script a video',
      objective: 'x',
      workflowKey: 'youtube_script',
    });
    const research = tasks.find((t) => t.step_key === 'research')!;
    await store.update('tasks', research.id, { status: 'failed' });
    await releaseUnblockedTasks(store, mission.id);

    const script = await store.get('tasks', tasks.find((t) => t.step_key === 'script')!.id);
    expect(script!.status).toBe('cancelled');
  });
});

describe('agent execution', () => {
  it('runs a task end to end and stores validated output', async () => {
    const { store, business, agents } = await makeWorkspace();
    const { mission, tasks } = await createMission(store, {
      ownerId: OWNER_ID,
      businessId: business.id,
      title: 'Find ideas',
      objective: 'x',
      workflowKey: 'youtube_ideas',
      seedInput: { count: 3, niche: 'ancient history' },
    });

    const result = await runAgent(store, OWNER_ID, tasks[0]!.id);

    expect(result.status).toBe('completed');
    expect(result.simulated).toBe(true);

    const ideas = await store.list('youtube_ideas', { where: { mission_id: mission.id } });
    expect(ideas.length).toBeGreaterThan(0);
    expect(ideas[0]!.score).toBeGreaterThanOrEqual(0);
    expect(ideas[0]!.score).toBeLessThanOrEqual(100);

    const agent = await store.get('agents', agents.researcher.id);
    expect(agent!.tasks_completed).toBe(1);
    expect(agent!.status).toBe('idle');
    expect(agent!.current_task_id).toBeNull();

    // Every run is accounted for, even a free one.
    const usage = await store.list('api_usage');
    expect(usage).toHaveLength(1);
    expect(usage[0]!.task_id).toBe(tasks[0]!.id);

    const activity = await store.list('activity_logs');
    expect(activity.some((a) => a.kind === 'agent_started')).toBe(true);
    expect(activity.some((a) => a.kind === 'agent_completed')).toBe(true);
  });

  it('does not record spend when nothing was spent', async () => {
    const { store, business } = await makeWorkspace();
    const { tasks } = await createMission(store, {
      ownerId: OWNER_ID,
      businessId: business.id,
      title: 'Find ideas',
      objective: 'x',
      workflowKey: 'youtube_ideas',
    });
    await runAgent(store, OWNER_ID, tasks[0]!.id);
    const transactions = await store.list('financial_transactions', {
      where: { kind: 'ai_cost' },
    });
    expect(transactions).toHaveLength(0);
  });

  it('fails the task, and says why, when the agent is disabled', async () => {
    const { store, business, agents } = await makeWorkspace();
    const { tasks } = await createMission(store, {
      ownerId: OWNER_ID,
      businessId: business.id,
      title: 'Find ideas',
      objective: 'x',
      workflowKey: 'youtube_ideas',
    });
    await store.update('agents', agents.researcher.id, { status: 'disabled' });

    const result = await runAgent(store, OWNER_ID, tasks[0]!.id);
    expect(result.status).toBe('failed');
    expect(result.error).toContain('disabled');

    const task = await store.get('tasks', tasks[0]!.id);
    expect(task!.status).toBe('failed');
    expect(task!.error).toBeTruthy();

    const agent = await store.get('agents', agents.researcher.id);
    expect(agent!.tasks_failed).toBe(1);

    const notifications = await store.list('notifications');
    expect(notifications.some((n) => n.kind === 'agent_failed')).toBe(true);
  });

  it('refuses to run an agent whose authority is below the work', async () => {
    const { store, business, agents } = await makeWorkspace();
    const { tasks } = await createMission(store, {
      ownerId: OWNER_ID,
      businessId: business.id,
      title: 'Find ideas',
      objective: 'x',
      workflowKey: 'youtube_ideas',
    });
    // Level 0 is read-only: it may not produce drafts.
    await store.update('agents', agents.researcher.id, { authority_level: 0 });

    const result = await runAgent(store, OWNER_ID, tasks[0]!.id);
    expect(result.status).toBe('failed');
    expect(result.error).toContain('Authority level 0');
  });
});

describe('approval gates', () => {
  it('stops the mission at a step that declares an approval', async () => {
    const { store, business } = await makeWorkspace();
    const { mission } = await createMission(store, {
      ownerId: OWNER_ID,
      businessId: business.id,
      title: 'Find ideas',
      objective: 'x',
      steps: [
        {
          capability: 'youtube.research.ideas',
          title: 'Research ideas',
          requires_approval: true,
          approval_label: 'Approve video idea',
        },
      ],
    });

    const run = await runMission(store, OWNER_ID, mission.id);
    expect(run.haltedBecause).toContain('approval');

    const approvals = await store.list('approvals');
    expect(approvals).toHaveLength(1);
    expect(approvals[0]!.title).toBe('Approve video idea');
    expect(approvals[0]!.status).toBe('pending');

    const updated = await store.get('missions', mission.id);
    expect(updated!.status).toBe('needs_approval');
  });

  it('completes the task and the mission when approved', async () => {
    const { store, business } = await makeWorkspace();
    const { mission } = await createMission(store, {
      ownerId: OWNER_ID,
      businessId: business.id,
      title: 'Find ideas',
      objective: 'x',
      steps: [
        { capability: 'youtube.research.ideas', title: 'Research ideas', requires_approval: true },
      ],
    });
    await runMission(store, OWNER_ID, mission.id);
    const approval = (await store.list('approvals'))[0]!;

    const result = await resolveApproval(store, OWNER_ID, approval.id, 'approve');
    expect(result.shouldContinue).toBe(true);

    const task = await store.get('tasks', approval.task_id!);
    expect(task!.status).toBe('completed');

    const updated = await recomputeMission(store, mission.id);
    expect(updated!.status).toBe('completed');
    expect(updated!.progress).toBe(100);
  });

  it('re-queues the task with the operator feedback when changes are requested', async () => {
    const { store, business } = await makeWorkspace();
    const { mission } = await createMission(store, {
      ownerId: OWNER_ID,
      businessId: business.id,
      title: 'Find ideas',
      objective: 'x',
      steps: [
        { capability: 'youtube.research.ideas', title: 'Research ideas', requires_approval: true },
      ],
    });
    await runMission(store, OWNER_ID, mission.id);
    const approval = (await store.list('approvals'))[0]!;

    await resolveApproval(
      store,
      OWNER_ID,
      approval.id,
      'request_changes',
      'Focus on the Bronze Age.',
    );

    const task = await store.get('tasks', approval.task_id!);
    expect(task!.status).toBe('queued');
    expect(task!.output).toBeNull();
    expect(task!.input.operator_feedback).toBe('Focus on the Bronze Age.');
  });

  it('cancels the task and stops the mission when rejected', async () => {
    const { store, business } = await makeWorkspace();
    const { mission } = await createMission(store, {
      ownerId: OWNER_ID,
      businessId: business.id,
      title: 'Find ideas',
      objective: 'x',
      steps: [
        { capability: 'youtube.research.ideas', title: 'Research ideas', requires_approval: true },
      ],
    });
    await runMission(store, OWNER_ID, mission.id);
    const approval = (await store.list('approvals'))[0]!;

    const result = await resolveApproval(store, OWNER_ID, approval.id, 'reject', 'Not this one.');
    expect(result.shouldContinue).toBe(false);

    const task = await store.get('tasks', approval.task_id!);
    expect(task!.status).toBe('cancelled');
  });

  it('will not resolve the same approval twice', async () => {
    const { store, business } = await makeWorkspace();
    const { mission } = await createMission(store, {
      ownerId: OWNER_ID,
      businessId: business.id,
      title: 'Find ideas',
      objective: 'x',
      steps: [
        { capability: 'youtube.research.ideas', title: 'Research ideas', requires_approval: true },
      ],
    });
    await runMission(store, OWNER_ID, mission.id);
    const approval = (await store.list('approvals'))[0]!;

    await resolveApproval(store, OWNER_ID, approval.id, 'approve');
    await expect(resolveApproval(store, OWNER_ID, approval.id, 'approve')).rejects.toThrow(
      /already been resolved/,
    );
  });

  it('marks the approved idea approved', async () => {
    const { store, business } = await makeWorkspace();
    const idea = {
      id: '00000000-0000-4000-8000-0000000000aa',
      business_id: business.id,
      channel_id: null,
      mission_id: null,
      task_id: null,
      title: 'An idea',
      topic: '',
      niche: '',
      summary: '',
      target_audience: '',
      why_it_might_work: '',
      competition: '',
      demand: '',
      monetisation: '',
      longevity: '',
      click_potential: '',
      difficulty: '',
      confidence: 0.5,
      sources: [],
      notes: '',
      score: 70,
      breakdown: {
        demand: 70,
        competition: 70,
        monetisation: 70,
        longevity: 70,
        click_potential: 70,
      },
      status: 'proposed' as const,
      is_demo: false,
      created_at: new Date().toISOString(),
    };
    await store.insert('youtube_ideas', idea);
    await store.insert('approvals', {
      id: '00000000-0000-4000-8000-0000000000bb',
      owner_id: OWNER_ID,
      business_id: business.id,
      mission_id: null,
      task_id: null,
      agent_id: null,
      kind: 'idea',
      title: 'Approve idea',
      summary: '',
      payload: { idea_id: idea.id },
      status: 'pending',
      feedback: null,
      is_demo: false,
      created_at: new Date().toISOString(),
      resolved_at: null,
    });

    await resolveApproval(store, OWNER_ID, '00000000-0000-4000-8000-0000000000bb', 'approve');
    expect((await store.get('youtube_ideas', idea.id))!.status).toBe('approved');
  });
});

describe('mission runner', () => {
  it('walks a multi-step workflow, logging the handoffs', async () => {
    const { store, business } = await makeWorkspace();
    const { mission } = await createMission(store, {
      ownerId: OWNER_ID,
      businessId: business.id,
      title: 'Script a video',
      objective: 'x',
      workflowKey: 'youtube_script',
    });

    const run = await runMission(store, OWNER_ID, mission.id, { maxSteps: 10 });

    // Research and script must both have run before anything stopped.
    expect(run.results.length).toBeGreaterThanOrEqual(2);
    const tasks = await store.list('tasks', { where: { mission_id: mission.id } });
    const research = tasks.find((t) => t.step_key === 'research')!;
    expect(research.status).toBe('completed');

    const handoffs = (await store.list('activity_logs')).filter((a) => a.kind === 'handoff');
    expect(handoffs.length).toBeGreaterThan(0);
    expect(handoffs[0]!.target_agent_id).toBeTruthy();
  });

  it('honours the step ceiling so one request cannot run away', async () => {
    const { store, business } = await makeWorkspace();
    const { mission } = await createMission(store, {
      ownerId: OWNER_ID,
      businessId: business.id,
      title: 'Script a video',
      objective: 'x',
      workflowKey: 'youtube_script',
    });
    const run = await runMission(store, OWNER_ID, mission.id, { maxSteps: 1 });
    expect(run.results).toHaveLength(1);
  });
});
