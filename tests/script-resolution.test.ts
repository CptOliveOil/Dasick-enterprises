import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ScriptUnavailable,
  resolveMissionScript,
} from '@/lib/workflows/script-resolution';
import { traceMission } from '@/lib/workflows/trace';
import { runAgent } from '@/lib/agents/engine';
import { runMission } from '@/lib/workflows/runner';
import { createMission } from '@/lib/workflows/engine';
import { resolveApproval } from '@/lib/workflows/approvals';
import { uuid } from '@/lib/ids';
import { makeProductionWorkspace, makeWorkspace, OWNER_ID } from './helpers';
import type { DataStore } from '@/lib/db/tables';
import type { Mission, ScriptSection, Task } from '@/types/domain';

/**
 * The bug: a mission reached its revision step and failed with "No script was
 * supplied to revise", while the approval screen reported that the original
 * records were gone.
 *
 * Nothing deletes scripts. Nothing in this codebase ever has. The script was
 * never *found* — every step resolved it for itself from ambient context, and
 * when that came up empty each one behaved differently and quietly: the fact
 * checker substituted the literal string "(script unavailable)" and checked
 * that, the reviser threw a message that covered two unrelated faults, and the
 * approval screen fell back to its own snapshot.
 *
 * These tests hold the properties that make that impossible: one resolver, an
 * archive fallback, and loud failure with the full search attached.
 */

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
  vi.stubEnv('ANTHROPIC_API_KEY', '');
});

const SECTIONS: ScriptSection[] = [
  { kind: 'hook', heading: 'The opening', body: 'A question nobody answered for years.' },
  { kind: 'main', heading: 'The middle', body: 'What the records actually show about it.' },
  { kind: 'payoff', heading: 'The answer', body: 'And this is why it was never rebroadcast.' },
];

async function fixture(options: { withVersions?: boolean } = {}) {
  const { store, business, agents } = await makeWorkspace();
  const timestamp = new Date().toISOString();

  const mission: Mission = {
    id: uuid(),
    owner_id: OWNER_ID,
    business_id: business.id,
    parent_mission_id: null,
    number: 3,
    title: 'Porygon Pokémon Anime Disappearance Documentary',
    objective: 'Produce one full video',
    status: 'running',
    priority: 'normal',
    target_date: null,
    target_time: null,
    workflow_definition_id: null,
    context: {},
    progress: 40,
    is_demo: false,
    created_at: timestamp,
    updated_at: timestamp,
    completed_at: null,
  };
  await store.insert('missions', mission);

  const scriptTask: Task = {
    id: uuid(),
    owner_id: OWNER_ID,
    mission_id: mission.id,
    business_id: business.id,
    agent_id: agents.writer.id,
    step_key: 'script',
    title: 'Write script',
    description: '',
    status: 'completed',
    priority: 'normal',
    input: { capability: 'youtube.script.write' },
    output: null,
    error: null,
    progress: 100,
    is_demo: false,
    created_at: timestamp,
    started_at: timestamp,
    completed_at: timestamp,
    due_at: null,
  };
  await store.insert('tasks', scriptTask);

  const scriptId = uuid();
  await store.insert('youtube_scripts', {
    id: scriptId,
    business_id: business.id,
    idea_id: null,
    research_id: null,
    task_id: scriptTask.id,
    title: 'The episode that vanished',
    sections: SECTIONS,
    word_count: 20,
    estimated_duration_seconds: 8,
    tone: 'documentary',
    audience: 'adults',
    goal: 'explain',
    status: 'awaiting_approval',
    version: 1,
    is_demo: false,
    created_at: timestamp,
    updated_at: timestamp,
  });

  if (options.withVersions !== false) {
    await store.insert('youtube_script_versions', {
      id: uuid(),
      script_id: scriptId,
      version: 1,
      sections: SECTIONS,
      note: 'Initial draft',
      created_at: timestamp,
    });
  }

  return { store, business, agents, mission, scriptTask, scriptId };
}

const input = (over: Partial<Parameters<typeof resolveMissionScript>[1]> = {}) => ({
  taskInput: {},
  previousOutputs: {},
  missionId: null,
  businessId: null,
  ...over,
});

/* ------------------------------------------------------------------ */

describe('resolving the canonical script', () => {
  it('finds it from the task input', async () => {
    const { store, mission, business, scriptId } = await fixture();
    const found = await resolveMissionScript(
      store,
      input({ taskInput: { script_id: scriptId }, missionId: mission.id, businessId: business.id }),
    );
    expect(found.script.id).toBe(scriptId);
    expect(found.via).toBe('task_input');
    expect(found.restoredFromArchive).toBe(false);
  });

  it('finds it from any earlier step, not just one named "script"', async () => {
    const { store, mission, business, scriptId } = await fixture();
    const found = await resolveMissionScript(
      store,
      input({
        // A rework step writes its own key. The old resolver looked only at
        // `previousOutputs.script` and missed the newer draft entirely.
        previousOutputs: { rework_script_abc123: { script_id: scriptId } },
        missionId: mission.id,
        businessId: business.id,
      }),
    );
    expect(found.script.id).toBe(scriptId);
    expect(found.via).toBe('previous_step');
  });

  it('follows the id inside an approval payload — the pointer, not the snapshot', async () => {
    const { store, mission, business, scriptId } = await fixture();
    await store.insert('approvals', {
      id: uuid(),
      owner_id: OWNER_ID,
      business_id: business.id,
      mission_id: mission.id,
      task_id: null,
      agent_id: null,
      kind: 'script',
      title: 'Approve script',
      summary: '1 claim checked, 1 warning',
      payload: { script_id: scriptId },
      status: 'approved',
      feedback: null,
      resolved_at: null,
      is_demo: false,
      created_at: new Date().toISOString(),
    });

    const found = await resolveMissionScript(
      store,
      input({ missionId: mission.id, businessId: business.id }),
    );
    expect(found.via).toBe('approval_payload');
    // The canonical row, with its real sections — not the payload's summary.
    expect(found.script.sections).toEqual(SECTIONS);
  });

  it('walks the mission’s own tasks when every reference has been lost', async () => {
    const { store, mission, business, scriptId } = await fixture();
    const found = await resolveMissionScript(
      store,
      // No task input, no step outputs, no approval. The mission still owns it.
      input({ missionId: mission.id, businessId: business.id }),
    );
    expect(found.script.id).toBe(scriptId);
    expect(found.via).toBe('mission_tasks');
  });

  it('never treats an empty string or junk as an id', async () => {
    const { store, mission, business, scriptId } = await fixture();
    for (const bad of ['', '   ', 'undefined', 'null', 42, null]) {
      const found = await resolveMissionScript(
        store,
        input({ taskInput: { script_id: bad }, missionId: mission.id, businessId: business.id }),
      );
      // Falls past the bad value rather than querying with it — the blank-uuid
      // class of bug cannot start here.
      expect(found.script.id).toBe(scriptId);
      expect(found.via).not.toBe('task_input');
    }
  });
});

/* ------------------------------------------------------------------ */

describe('the archive layer', () => {
  it('rebuilds a script whose head row has gone, from its versions', async () => {
    const { store, mission, business, scriptId } = await fixture();
    // Simulate the row being unreachable by any means — the case the operator
    // was told had happened.
    await store.remove('youtube_scripts', scriptId);

    const found = await resolveMissionScript(
      store,
      input({ taskInput: { script_id: scriptId }, missionId: mission.id, businessId: business.id }),
    );

    expect(found.restoredFromArchive).toBe(true);
    expect(found.script.id).toBe(scriptId);
    expect(found.script.sections).toEqual(SECTIONS);
    // And written back, so the next step finds a row rather than rebuilding.
    expect(await store.get('youtube_scripts', scriptId)).not.toBeNull();
  });

  it('rebuilds from the newest archived version, not the first', async () => {
    const { store, mission, business, scriptId } = await fixture();
    const later: ScriptSection[] = [
      { kind: 'hook', heading: 'The opening', body: 'A much better opening line.' },
    ];
    await store.insert('youtube_script_versions', {
      id: uuid(),
      script_id: scriptId,
      version: 2,
      sections: later,
      note: 'Rewrite the opening',
      created_at: new Date(Date.now() + 1000).toISOString(),
    });
    await store.remove('youtube_scripts', scriptId);

    const found = await resolveMissionScript(
      store,
      input({ taskInput: { script_id: scriptId }, missionId: mission.id, businessId: business.id }),
    );
    expect(found.script.version).toBe(2);
    expect(found.script.sections).toEqual(later);
  });

  it('keeps every archived version through a rebuild', async () => {
    const { store, mission, business, scriptId } = await fixture();
    await store.remove('youtube_scripts', scriptId);
    await resolveMissionScript(
      store,
      input({ taskInput: { script_id: scriptId }, missionId: mission.id, businessId: business.id }),
    );
    const versions = await store.list('youtube_script_versions', {
      where: { script_id: scriptId },
    });
    expect(versions).toHaveLength(1);
  });
});

/* ------------------------------------------------------------------ */

describe('failing loudly', () => {
  it('names every place it looked instead of "No script was supplied"', async () => {
    const { store, business } = await makeWorkspace();
    const missionId = uuid();

    const error = await resolveMissionScript(
      store,
      input({
        taskInput: { script_id: '' },
        previousOutputs: { research: { research_id: uuid() } },
        missionId,
        businessId: business.id,
      }),
    ).then(
      () => null,
      (caught) => caught as ScriptUnavailable,
    );

    expect(error).toBeInstanceOf(ScriptUnavailable);
    const sources = error!.attempts.map((attempt) => attempt.source);
    expect(sources).toContain('task_input');
    expect(sources).toContain('previous_step');
    expect(sources).toContain('approval_payload');
    expect(sources).toContain('mission_tasks');
    // The two faults the old message conflated are now distinguishable.
    expect(error!.message).toMatch(/not a uuid/);
    expect(error!.message).toMatch(/missing rather than merely unreferenced/);
  });

  it('refuses to fact check a script it could not read', async () => {
    const { store, business, agents } = await makeWorkspace();
    const timestamp = new Date().toISOString();
    const mission: Mission = {
      id: uuid(),
      owner_id: OWNER_ID,
      business_id: business.id,
      parent_mission_id: null,
      number: 1,
      title: 'A mission with no script',
      objective: 'x',
      status: 'running',
      priority: 'normal',
      target_date: null,
      target_time: null,
      workflow_definition_id: null,
      context: {},
      progress: 0,
      is_demo: false,
      created_at: timestamp,
      updated_at: timestamp,
      completed_at: null,
    };
    await store.insert('missions', mission);
    const task: Task = {
      id: uuid(),
      owner_id: OWNER_ID,
      mission_id: mission.id,
      business_id: business.id,
      agent_id: agents.checker.id,
      step_key: 'fact_check',
      title: 'Fact check',
      description: '',
      status: 'queued',
      priority: 'normal',
      input: { capability: 'youtube.script.factcheck' },
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

    const result = await runAgent(store, OWNER_ID, task.id);

    // It used to "pass": it checked the literal string "(script unavailable)",
    // wrote a fact_check row, and raised an approval for a script that was
    // never read. A verification step with nothing to verify must fail.
    expect(result.status).toBe('failed');
    expect(result.error).toMatch(/No script could be resolved/);
    expect(await store.list('youtube_fact_checks')).toHaveLength(0);
    expect(await store.list('approvals')).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */

describe('the mission graph trace', () => {
  it('reports a clean mission as clean', async () => {
    const { store, mission, scriptTask, scriptId } = await fixture();
    await store.update('tasks', scriptTask.id, { output: { script_id: scriptId } });

    const trace = await traceMission(store, (await store.get('missions', mission.id))!);
    expect(trace.dangling).toHaveLength(0);
    expect(trace.scripts).toHaveLength(1);
    expect(trace.scripts[0]!.versionsArchived).toBe(1);
    expect(trace.summary).toMatch(/Every referenced record resolves/);
  });

  it('names a dangling reference and says whether the work still exists', async () => {
    const { store, mission, scriptTask } = await fixture();
    const ghost = uuid();
    await store.update('tasks', scriptTask.id, { output: { script_id: ghost } });

    const trace = await traceMission(store, (await store.get('missions', mission.id))!);
    expect(trace.dangling).toHaveLength(1);
    expect(trace.dangling[0]).toMatchObject({ key: 'script_id', table: 'youtube_scripts', id: ghost });
    // The distinction that matters: the reference is wrong, the work is fine.
    expect(trace.summary).toMatch(/the work exists and the reference is what is wrong/);
  });

  it('shows the input ids, output ids and approval payload for every edge', async () => {
    const { store, mission, scriptTask, scriptId, business } = await fixture();
    await store.update('tasks', scriptTask.id, { output: { script_id: scriptId } });
    await store.insert('approvals', {
      id: uuid(),
      owner_id: OWNER_ID,
      business_id: business.id,
      mission_id: mission.id,
      task_id: scriptTask.id,
      agent_id: null,
      kind: 'script',
      title: 'Approve script',
      summary: '',
      payload: { script_id: scriptId },
      status: 'pending',
      feedback: null,
      resolved_at: null,
      is_demo: false,
      created_at: new Date().toISOString(),
    });

    const trace = await traceMission(store, (await store.get('missions', mission.id))!);
    const edge = trace.edges.find((entry) => entry.stepKey === 'script')!;
    expect(edge.outputs.find((ref) => ref.key === 'script_id')?.resolves).toBe(true);
    expect(edge.approval?.payload.find((ref) => ref.key === 'script_id')?.resolves).toBe(true);
    expect(edge.capability).toBe('youtube.script.write');
  });
});

/* ------------------------------------------------------------------ */

describe('the reported failure, end to end', () => {
  it('produces a version 2 and survives every step after the approval', async () => {
    const { store, business } = await makeProductionWorkspace();
    const { mission } = await createMission(store, {
      ownerId: OWNER_ID,
      businessId: business.id,
      title: 'Porygon Pokémon Anime Disappearance Documentary',
      objective: 'Full pipeline',
      workflowKey: 'youtube_video_full',
    });
    await runMission(store, OWNER_ID, mission.id, { maxSteps: 12 });

    const approval = (await store.list('approvals', { where: { status: 'pending' } })).find(
      (entry) => entry.kind === 'script',
    )!;
    const scriptId = approval.payload.script_id as string;
    expect(scriptId).toBeTruthy();

    // Request changes → the Scriptwriter produces version 2.
    await resolveApproval(store, OWNER_ID, approval.id, 'request_changes', 'Rewrite the opening.');
    await runMission(store, OWNER_ID, mission.id, { maxSteps: 12 });

    const revised = await store.get('youtube_scripts', scriptId);
    expect(revised, 'the script must survive a revision').not.toBeNull();
    expect(revised!.version).toBe(2);

    // Version history is preserved, not replaced.
    const versions = await store.list('youtube_script_versions', { where: { script_id: scriptId } });
    expect(versions.map((entry) => entry.version).sort()).toEqual([1, 2]);

    // No step failed for want of a script.
    const tasks = await store.list('tasks', { where: { mission_id: mission.id } });
    for (const task of tasks) {
      expect(task.error ?? '').not.toMatch(/script/i);
    }

    // Approve the re-check, and downstream production runs on the latest version.
    const second = (await store.list('approvals', { where: { status: 'pending' } })).find(
      (entry) => entry.kind === 'script',
    )!;
    await resolveApproval(store, OWNER_ID, second.id, 'approve');
    await runMission(store, OWNER_ID, mission.id, { maxSteps: 20 });

    const final = await store.get('youtube_scripts', scriptId);
    expect(final!.version).toBe(2);
    expect(final!.status).toBe('approved');

    const trace = await traceMission(store, (await store.get('missions', mission.id))!);
    expect(trace.dangling).toHaveLength(0);
  }, 90_000);

  it('recovers a mission whose script row was lost mid-flight', async () => {
    const { store, business } = await makeProductionWorkspace();
    const { mission } = await createMission(store, {
      ownerId: OWNER_ID,
      businessId: business.id,
      title: 'A mission that loses its script',
      objective: 'Full pipeline',
      workflowKey: 'youtube_video_full',
    });
    await runMission(store, OWNER_ID, mission.id, { maxSteps: 12 });

    const approval = (await store.list('approvals', { where: { status: 'pending' } })).find(
      (entry) => entry.kind === 'script',
    )!;
    const scriptId = approval.payload.script_id as string;

    // The exact situation the operator was shown: the head row is gone.
    await store.remove('youtube_scripts', scriptId);

    await resolveApproval(store, OWNER_ID, approval.id, 'request_changes', 'Rewrite the opening.');
    await runMission(store, OWNER_ID, mission.id, { maxSteps: 12 });

    // Rebuilt from the archive rather than failing the mission.
    const recovered = await store.get('youtube_scripts', scriptId);
    expect(recovered, 'the archive must have rebuilt it').not.toBeNull();
    expect(recovered!.sections.length).toBeGreaterThan(0);

    const rework = (await store.list('tasks', { where: { mission_id: mission.id } })).find(
      (task) => task.input.capability === 'youtube.script.revise',
    )!;
    expect(rework.status).toBe('completed');
    expect(rework.error).toBeNull();
  }, 90_000);
});

/* ------------------------------------------------------------------ */

describe('a real workspace is never served demo data', () => {
  it('refuses rather than substituting the seeded dataset', async () => {
    vi.resetModules();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key');

    // A configured project with no readable session — an expired cookie.
    vi.doMock('@/lib/supabase/server', () => ({
      createSupabaseServerClient: async () => ({
        auth: { getUser: async () => ({ data: { user: null } }) },
      }),
    }));

    const { getStore, NotSignedIn } = await import('@/lib/db');

    // This used to return the in-memory demo store, under a demo owner id.
    // Every read then came back null, which is indistinguishable from the
    // records having been deleted — and is exactly what the operator was told
    // had happened.
    await expect(getStore()).rejects.toBeInstanceOf(NotSignedIn);
    await expect(getStore()).rejects.toThrow(/session has expired/i);

    vi.doUnmock('@/lib/supabase/server');
    vi.resetModules();
  });

  it('still runs on demo data when Supabase is not configured at all', async () => {
    vi.resetModules();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');

    const { getStore } = await import('@/lib/db');
    const context = await getStore();
    expect(context.isDemo).toBe(true);
    vi.resetModules();
  });
});

/** Kept for the type checker: the fixture returns a live store. */
export type _Store = DataStore;
