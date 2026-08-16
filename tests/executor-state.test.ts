import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assignStepKeys, createMission } from '@/lib/workflows/engine';
import { runMission } from '@/lib/workflows/runner';
import { resolveApproval } from '@/lib/workflows/approvals';
import { loadPreviousOutputs } from '@/lib/agents/context';
import { resolveMissionScript } from '@/lib/workflows/script-resolution';
import { traceMission } from '@/lib/workflows/trace';
import { uuid } from '@/lib/ids';
import { makeProductionWorkspace, OWNER_ID } from './helpers';
import type { PlannedStep } from '@/lib/workflows/engine';

/**
 * Step 4 — what the executor hands the revision step after an approval.
 *
 * The script existed the whole time. The approval read it back correctly. The
 * revision step still could not see it, and the reason was two lines apart in
 * the executor:
 *
 *   const stepKey = step.key ?? step.capability.split('.').pop();
 *   const fromStep = ctx.previousOutputs.script?.script_id;
 *
 * A mission built from a workflow definition sets `key: 'script'` by hand, so
 * the second line found it. A mission planned by the Manager — which is what
 * Mission #003 is — derives its key from the capability and gets `write`. The
 * lookup missed in *every* AI-planned mission, and every test in this repo
 * built missions from workflow definitions, so nothing caught it.
 *
 * These tests plan missions the way the Manager does: steps with no key.
 */

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
  vi.stubEnv('ANTHROPIC_API_KEY', '');
});

/** Exactly the shape `handleCommand` builds from a model plan: no `key`. */
const PLANNED: PlannedStep[] = [
  {
    capability: 'youtube.research.package',
    title: 'Research the Porygon incident',
    depends_on: [],
  },
  {
    capability: 'youtube.script.write',
    title: 'Write the documentary script',
    depends_on: [0],
  },
  {
    capability: 'youtube.script.factcheck',
    title: 'Fact check every claim',
    depends_on: [1],
    requires_approval: true,
    approval_label: 'Approve script',
  },
  {
    capability: 'youtube.script.revise',
    title: 'Finalize script with fact-check corrections',
    depends_on: [2],
  },
];

async function plannedMission() {
  const workspace = await makeProductionWorkspace();
  const { mission } = await createMission(workspace.store, {
    ownerId: OWNER_ID,
    businessId: workspace.business.id,
    title: 'Porygon Pokémon Anime Disappearance Documentary',
    objective: 'Produce one full video',
    steps: PLANNED,
  });
  return { ...workspace, mission };
}

/* ------------------------------------------------------------------ */

describe('step keys', () => {
  it('never collides, so no step can overwrite another’s output', () => {
    const keys = assignStepKeys([
      { capability: 'youtube.voiceover.generate' },
      { capability: 'youtube.thumbnail.generate' },
      { capability: 'youtube.research.ideas' },
      { capability: 'pokemon.research.ideas' },
    ]);
    // Under the old derivation these were `generate, generate, ideas, ideas`,
    // and `loadPreviousOutputs` kept two of the four.
    expect(new Set(keys).size).toBe(4);
  });

  it('keeps the explicit key a workflow definition sets', () => {
    expect(assignStepKeys([{ capability: 'youtube.script.write', key: 'script' }])).toEqual([
      'script',
    ]);
  });

  it('distinguishes the same capability used twice in one plan', () => {
    const keys = assignStepKeys([
      { capability: 'youtube.script.revise' },
      { capability: 'youtube.script.revise' },
    ]);
    expect(keys[0]).not.toBe(keys[1]);
  });

  it('gives an AI-planned script step a key the resolver can find', async () => {
    const { store, mission } = await plannedMission();
    const tasks = await store.list('tasks', { where: { mission_id: mission.id } });
    const keys = tasks.map((task) => task.step_key);
    expect(new Set(keys).size).toBe(tasks.length);
    // The old derivation produced `write`; nothing looked for that.
    expect(keys).toContain('youtube_script_write');
  });
});

/* ------------------------------------------------------------------ */

describe('previous outputs', () => {
  it('lets later work win deterministically when keys repeat', async () => {
    const { store, business, mission } = await plannedMission();
    const base = {
      owner_id: OWNER_ID,
      mission_id: mission.id,
      business_id: business.id,
      agent_id: null,
      step_key: 'shared',
      title: 'A step',
      description: '',
      status: 'completed' as const,
      priority: 'normal' as const,
      input: {},
      error: null,
      progress: 100,
      is_demo: false,
      started_at: null,
      due_at: null,
      claimed_at: null,
      heartbeat_at: null,
      reclaim_count: 0,
    };
    await store.insert('tasks', {
      ...base,
      id: uuid(),
      output: { script_id: 'older' },
      created_at: '2026-01-01T00:00:00.000Z',
      completed_at: '2026-01-01T00:00:00.000Z',
    });
    await store.insert('tasks', {
      ...base,
      id: uuid(),
      output: { script_id: 'newer' },
      created_at: '2026-01-02T00:00:00.000Z',
      completed_at: '2026-01-02T00:00:00.000Z',
    });

    const outputs = await loadPreviousOutputs(store, mission.id, uuid());
    expect(outputs.shared?.script_id).toBe('newer');
  });
});

/* ------------------------------------------------------------------ */

describe('which version the executor resolves', () => {
  it('takes the newest script when several steps name one', async () => {
    const { store, business, mission } = await plannedMission();
    const timestamp = new Date().toISOString();
    const ids = [uuid(), uuid()];

    for (const [index, id] of ids.entries()) {
      await store.insert('youtube_scripts', {
        id,
        business_id: business.id,
        idea_id: null,
        research_id: null,
        task_id: null,
        title: `Draft ${index + 1}`,
        sections: [{ kind: 'main', heading: 'H', body: `Body ${index + 1}` }],
        word_count: 2,
        estimated_duration_seconds: 1,
        tone: 'documentary',
        audience: '',
        goal: '',
        status: 'draft',
        version: index + 1,
        is_demo: false,
        created_at: timestamp,
        updated_at: timestamp,
      });
    }

    const resolved = await resolveMissionScript(store, {
      taskInput: {},
      // Deliberately out of order: the stale one is listed first, which is
      // exactly what an arbitrary row order would produce.
      previousOutputs: {
        youtube_script_write: { script_id: ids[0] },
        rework_script_abc: { script_id: ids[1] },
      },
      missionId: mission.id,
      businessId: business.id,
    });

    expect(resolved.script.id).toBe(ids[1]);
    expect(resolved.script.version).toBe(2);
    expect(resolved.attempts.at(-1)!.note).toMatch(/took the newest/);
  });
});

/* ------------------------------------------------------------------ */

describe('the reported mission, end to end', () => {
  it('hands the revision step the approved version 2 script', async () => {
    const { store, mission } = await plannedMission();

    // Research → Script → Fact check → (approval gate)
    await runMission(store, OWNER_ID, mission.id, { maxSteps: 12 });

    const approval = (await store.list('approvals', { where: { status: 'pending' } })).find(
      (entry) => entry.kind === 'script',
    )!;
    expect(approval, 'the fact check should have raised a script approval').toBeTruthy();

    const scriptId = approval.payload.script_id as string;
    const beforeApproval = await store.get('youtube_scripts', scriptId);
    expect(beforeApproval!.version).toBe(1);

    // The payload the revision step would see *before* the approval.
    const reviseTask = (await store.list('tasks', { where: { mission_id: mission.id } })).find(
      (task) => task.input.capability === 'youtube.script.revise',
    )!;
    expect(reviseTask.status).toBe('waiting');
    const before = await resolveMissionScript(store, {
      taskInput: reviseTask.input,
      previousOutputs: await loadPreviousOutputs(store, mission.id, reviseTask.id),
      missionId: mission.id,
      businessId: reviseTask.business_id,
    });
    expect(before.script.id).toBe(scriptId);
    expect(before.script.version).toBe(1);

    // ↓ Approval
    await resolveApproval(store, OWNER_ID, approval.id, 'approve');
    expect((await store.get('youtube_scripts', scriptId))!.status).toBe('approved');

    // ↓ Revision. This is the step that used to fail with "No script was
    //   supplied to revise" in every AI-planned mission.
    await runMission(store, OWNER_ID, mission.id, { maxSteps: 12 });

    const finished = (await store.list('tasks', { where: { mission_id: mission.id } })).find(
      (task) => task.id === reviseTask.id,
    )!;
    expect(finished.error).toBeNull();
    expect(finished.status).toBe('completed');
    expect(finished.output?.script_id).toBe(scriptId);
    expect(finished.output?.version).toBe(2);

    // It operated on the approved script and produced the next version of it,
    // rather than starting a new one.
    const after = await store.get('youtube_scripts', scriptId);
    expect(after!.version).toBe(2);

    // Version history preserved, not replaced.
    const versions = await store.list('youtube_script_versions', { where: { script_id: scriptId } });
    expect(versions.map((entry) => entry.version).sort()).toEqual([1, 2]);

    // And the mission graph is intact: no dangling references, one script.
    const trace = await traceMission(store, (await store.get('missions', mission.id))!);
    expect(trace.dangling).toHaveLength(0);
    expect(trace.scripts).toHaveLength(1);
    expect(trace.scripts[0]!.version).toBe(2);
  }, 90_000);

  it('does not loop: the revision step runs once and stays completed', async () => {
    const { store, mission } = await plannedMission();
    await runMission(store, OWNER_ID, mission.id, { maxSteps: 12 });

    const approval = (await store.list('approvals', { where: { status: 'pending' } })).find(
      (entry) => entry.kind === 'script',
    )!;
    await resolveApproval(store, OWNER_ID, approval.id, 'approve');
    await runMission(store, OWNER_ID, mission.id, { maxSteps: 12 });

    const revise = (await store.list('tasks', { where: { mission_id: mission.id } })).find(
      (task) => task.input.capability === 'youtube.script.revise',
    )!;
    const versionsAfterFirst = (
      await store.list('youtube_script_versions', {
        where: { script_id: revise.output!.script_id as string },
      })
    ).length;

    // Running the mission again must be a no-op, not another revision.
    await runMission(store, OWNER_ID, mission.id, { maxSteps: 12 });

    const again = (await store.list('tasks', { where: { mission_id: mission.id } })).find(
      (task) => task.id === revise.id,
    )!;
    expect(again.status).toBe('completed');
    expect(
      (
        await store.list('youtube_script_versions', {
          where: { script_id: revise.output!.script_id as string },
        })
      ).length,
    ).toBe(versionsAfterFirst);

    const finished = await store.get('missions', mission.id);
    expect(finished!.status).toBe('completed');
  }, 90_000);
});
