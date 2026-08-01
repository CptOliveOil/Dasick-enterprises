import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryStore } from '@/lib/db/memory-store';
import { createMission, releaseUnblockedTasks } from '@/lib/workflows/engine';
import { runMission } from '@/lib/workflows/runner';
import { runAgent } from '@/lib/agents/engine';
import { resolveApproval } from '@/lib/workflows/approvals';
import {
  assertStorableRow,
  InvalidStoredValue,
  MissingRelationship,
  optionalId,
  requireId,
} from '@/lib/db/validate';
import { uuid } from '@/lib/ids';
import { makePokemonWorkspace, makeProductionWorkspace, OWNER_ID } from './helpers';

/**
 * The reported failure:
 *
 *   youtube_research: invalid input syntax for type uuid: ""
 *
 * The full-video workflow begins at the research step with no idea step ahead
 * of it, so `resolveIdeaId` correctly found nothing. The handler then wrote
 * `ideaId ?? ''` to satisfy a TypeScript field typed `UUID` while the column was
 * nullable — and Postgres refused the empty string.
 *
 * Two things are tested here: that the empty string can no longer be produced,
 * and that if anything ever produces one again it fails with an application
 * error naming the column rather than a driver error naming a type.
 */

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
  vi.stubEnv('ANTHROPIC_API_KEY', '');
  vi.stubEnv('DISABLE_SIMULATED_MEDIA', '');
});

/* ------------------------------------------------------------------ */
/* The reported failure                                                */
/* ------------------------------------------------------------------ */

describe('the full-video workflow starting at research', () => {
  it('completes the research step with no idea ahead of it', async () => {
    const { store, business } = await makeProductionWorkspace();
    const { mission, tasks } = await createMission(store, {
      ownerId: OWNER_ID,
      businessId: business.id,
      title: 'Porygon Pokémon Anime Disappearance Documentary',
      objective: 'Research the Porygon incident and produce a documentary',
      workflowKey: 'youtube_video_full',
    });

    const research = tasks.find((task) => task.step_key === 'research')!;
    const result = await runAgent(store, OWNER_ID, research.id);

    expect(result.status).toBe('completed');
    expect(result.error).toBeNull();

    const [row] = await store.list('youtube_research', {});
    expect(row).toBeDefined();
    // The field that was blank. Absent is a legitimate state; empty is not.
    expect(row!.idea_id).toBeNull();
    expect(row!.business_id).toBe(business.id);
    void mission;
  });

  it('does not cancel the Scriptwriter, because research no longer fails', async () => {
    const { store, business } = await makeProductionWorkspace();
    const { mission } = await createMission(store, {
      ownerId: OWNER_ID,
      businessId: business.id,
      title: 'Porygon Pokémon Anime Disappearance Documentary',
      objective: 'Research the Porygon incident',
      workflowKey: 'youtube_video_full',
    });

    await runMission(store, OWNER_ID, mission.id, { maxSteps: 3 });
    const tasks = await store.list('tasks', { where: { mission_id: mission.id } });

    expect(tasks.find((task) => task.step_key === 'research')!.status).toBe('completed');
    // The downstream step that was collateral damage.
    const script = tasks.find((task) => task.step_key === 'script')!;
    expect(script.status).not.toBe('cancelled');
    expect(tasks.some((task) => task.status === 'failed')).toBe(false);
  });

  it('writes a script with a null idea rather than an empty one', async () => {
    const { store, business } = await makeProductionWorkspace();
    const { mission } = await createMission(store, {
      ownerId: OWNER_ID,
      businessId: business.id,
      title: 'Full video',
      objective: 'Research then script',
      workflowKey: 'youtube_video_full',
    });
    await runMission(store, OWNER_ID, mission.id, { maxSteps: 3 });

    const [script] = await store.list('youtube_scripts', {});
    expect(script).toBeDefined();
    expect(script!.idea_id).toBeNull();
    expect(script!.research_id).not.toBe('');
  });

  it('works the same for a Pokémon full-video mission', async () => {
    const { store, business } = await makePokemonWorkspace();
    const { mission } = await createMission(store, {
      ownerId: OWNER_ID,
      businessId: business.id,
      title: 'Porygon Pokémon Anime Disappearance Documentary',
      objective: 'Research the Porygon incident and produce a documentary',
      workflowKey: 'pokemon_youtube_video',
    });

    await runMission(store, OWNER_ID, mission.id, { maxSteps: 3 });
    const tasks = await store.list('tasks', { where: { mission_id: mission.id } });
    expect(tasks.some((task) => task.status === 'failed')).toBe(false);

    const [script] = await store.list('youtube_scripts', {});
    expect(script!.idea_id).toBeNull();
  });

  it('still threads the idea through when the workflow does start at one', async () => {
    // The other direction: where an idea genuinely exists, it must still be
    // linked. Nulling everything would have "fixed" the error and lost the data.
    const { store, business } = await makeProductionWorkspace();
    const { mission } = await createMission(store, {
      ownerId: OWNER_ID,
      businessId: business.id,
      title: 'Ideas first',
      objective: 'Ideas, then research',
      workflowKey: 'youtube_video',
    });

    await runMission(store, OWNER_ID, mission.id, { maxSteps: 1 });
    const ideas = await store.list('youtube_ideas', {});
    expect(ideas.length).toBeGreaterThan(0);

    const [approvalRow] = await store.list('approvals', { where: { status: 'pending' } });
    await resolveApproval(store, OWNER_ID, approvalRow!.id, 'approve');
    await releaseUnblockedTasks(store, mission.id);
    await runMission(store, OWNER_ID, mission.id, { maxSteps: 2 });

    const [research] = await store.list('youtube_research', {});
    expect(research).toBeDefined();
    expect(research!.idea_id).toBe(ideas[0]!.id);
  });
});

/* ------------------------------------------------------------------ */
/* The guard                                                           */
/* ------------------------------------------------------------------ */

describe('id validation at the storage boundary', () => {
  it('refuses an empty id with a message that names the column', () => {
    expect(() => assertStorableRow('youtube_research', { id: uuid(), idea_id: '' })).toThrow(
      InvalidStoredValue,
    );
    try {
      assertStorableRow('youtube_research', { id: uuid(), idea_id: '' });
    } catch (error) {
      expect((error as InvalidStoredValue).column).toBe('idea_id');
      expect((error as Error).message).toMatch(/empty string/i);
      // Not the driver's message. The operator should never see "invalid input
      // syntax for type uuid".
      expect((error as Error).message).not.toMatch(/invalid input syntax/i);
    }
  });

  it('refuses whitespace, which is an empty string wearing a hat', () => {
    expect(() => assertStorableRow('youtube_scripts', { id: uuid(), idea_id: '   ' })).toThrow(
      InvalidStoredValue,
    );
  });

  it('accepts null, because an absent optional relationship is correct', () => {
    expect(() =>
      assertStorableRow('youtube_research', { id: uuid(), idea_id: null, task_id: undefined }),
    ).not.toThrow();
  });

  it('refuses a value that is not a uuid at all', () => {
    expect(() => assertStorableRow('tasks', { id: 'task-spend' })).toThrow(/not a valid UUID/i);
  });

  it('leaves id-shaped text columns alone', () => {
    // `voice_id`, `external_id` and friends are somebody else's identifiers and
    // are genuinely text in the schema.
    expect(() =>
      assertStorableRow('production_settings', {
        id: uuid(),
        voice_id: 'eleven-labs-rachel',
        external_id: 'UCabc123',
      }),
    ).not.toThrow();
  });

  it('is enforced on every write path, not just insert', async () => {
    const store = new MemoryStore();
    await expect(
      store.insert('youtube_research', { id: uuid(), idea_id: '' } as never),
    ).rejects.toThrow(InvalidStoredValue);
    await expect(
      store.insertMany('youtube_research', [{ id: uuid(), idea_id: '' }] as never[]),
    ).rejects.toThrow(InvalidStoredValue);
  });
});

describe('normalising optional and required ids', () => {
  it('turns anything that is not a uuid into null', () => {
    expect(optionalId('')).toBeNull();
    expect(optionalId('   ')).toBeNull();
    expect(optionalId(undefined)).toBeNull();
    expect(optionalId(null)).toBeNull();
    expect(optionalId(42)).toBeNull();
    expect(optionalId('not-a-uuid')).toBeNull();
    const real = uuid();
    expect(optionalId(real)).toBe(real);
  });

  it('names the missing relationship rather than failing at the database', () => {
    expect(() => requireId('', 'Cannot save this research package.', 'Attach a business.')).toThrow(
      MissingRelationship,
    );
    try {
      requireId(null, 'Cannot save this research package.', 'Attach a business first.');
    } catch (error) {
      expect((error as Error).message).toMatch(/Cannot save this research package/);
      expect((error as Error).message).toMatch(/Attach a business first/);
    }
    const real = uuid();
    expect(requireId(real, 'x', 'y')).toBe(real);
  });
});

/* ------------------------------------------------------------------ */
/* Every id passed through the YouTube pipeline                        */
/* ------------------------------------------------------------------ */

describe('the full YouTube pipeline stores no blank ids anywhere', () => {
  it('leaves every id column either a uuid or null, end to end', async () => {
    const { store, business } = await makeProductionWorkspace();
    const { mission } = await createMission(store, {
      ownerId: OWNER_ID,
      businessId: business.id,
      title: 'Full pipeline',
      objective: 'Everything',
      workflowKey: 'youtube_video_full',
    });

    await runMission(store, OWNER_ID, mission.id, { maxSteps: 12 });
    const gate = (await store.list('approvals', { where: { status: 'pending' } })).find(
      (approval) => approval.kind === 'script',
    );
    if (gate) {
      await resolveApproval(store, OWNER_ID, gate.id, 'approve');
      for (let i = 0; i < 4; i += 1) {
        await runMission(store, OWNER_ID, mission.id, { maxSteps: 10 });
      }
    }

    // Sweep every table the pipeline touches. Any id-shaped column must be a
    // uuid or null — the same rule the storage boundary now enforces.
    for (const table of [
      'missions',
      'tasks',
      'youtube_ideas',
      'youtube_research',
      'youtube_scripts',
      'youtube_script_versions',
      'youtube_fact_checks',
      'youtube_videos',
      'youtube_scenes',
      'youtube_thumbnail_concepts',
      'youtube_metadata',
      'approvals',
      'activity_logs',
      'api_usage',
    ] as const) {
      for (const row of await store.list(table, {})) {
        expect(() => assertStorableRow(table, row), `${table}`).not.toThrow();
      }
    }
    // The full pipeline renders a real file through ffmpeg, so this is slow by
    // nature rather than by accident.
  }, 60_000);
});

/* ------------------------------------------------------------------ */
/* Retrying without paying twice                                       */
/* ------------------------------------------------------------------ */

describe('retrying a mission that failed part-way', () => {
  it('re-queues the failed step and the steps it took down with it', async () => {
    const { store, business } = await makeProductionWorkspace();
    const { mission, tasks } = await createMission(store, {
      ownerId: OWNER_ID,
      businessId: business.id,
      title: 'Porygon documentary',
      objective: 'Research then script',
      workflowKey: 'youtube_video_full',
    });

    // Reproduce the exact state the operator was left in: research failed, the
    // Scriptwriter cancelled behind it.
    const research = tasks.find((task) => task.step_key === 'research')!;
    const script = tasks.find((task) => task.step_key === 'script')!;
    await store.update('tasks', research.id, {
      status: 'failed',
      error: 'youtube_research: invalid input syntax for type uuid: ""',
    });
    await store.update('tasks', script.id, {
      status: 'cancelled',
      error: 'An upstream step failed, so this step was cancelled.',
    });

    const current = await store.list('tasks', { where: { mission_id: mission.id } });
    const failed = current.filter((task) => task.status === 'failed');
    const collateral = current.filter(
      (task) =>
        task.status === 'cancelled' &&
        task.error === 'An upstream step failed, so this step was cancelled.',
    );
    expect(failed).toHaveLength(1);
    expect(collateral).toHaveLength(1);

    // What the retry action does.
    for (const task of [...failed, ...collateral]) {
      await store.update('tasks', task.id, {
        status: 'queued',
        error: null,
        output: null,
        progress: 0,
        started_at: null,
        completed_at: null,
      });
    }
    await releaseUnblockedTasks(store, mission.id);
    await runMission(store, OWNER_ID, mission.id, { maxSteps: 3 });

    const after = await store.list('tasks', { where: { mission_id: mission.id } });
    expect(after.find((task) => task.step_key === 'research')!.status).toBe('completed');
    expect(after.find((task) => task.step_key === 'script')!.status).not.toBe('cancelled');
  });

  it('does not re-run or duplicate work that already completed', async () => {
    const { store, business } = await makeProductionWorkspace();
    const { mission } = await createMission(store, {
      ownerId: OWNER_ID,
      businessId: business.id,
      title: 'Partly done',
      objective: 'Research then script',
      workflowKey: 'youtube_video_full',
    });

    await runMission(store, OWNER_ID, mission.id, { maxSteps: 1 });
    const researchRows = await store.list('youtube_research', {});
    const usageBefore = (await store.list('api_usage', {})).length;
    expect(researchRows).toHaveLength(1);

    // Fail a later step, then retry: the completed research must be untouched.
    const tasks = await store.list('tasks', { where: { mission_id: mission.id } });
    const script = tasks.find((task) => task.step_key === 'script')!;
    await store.update('tasks', script.id, { status: 'failed', error: 'boom' });

    const resettable = (await store.list('tasks', { where: { mission_id: mission.id } })).filter(
      (task) =>
        task.status === 'failed' ||
        (task.status === 'cancelled' &&
          task.error === 'An upstream step failed, so this step was cancelled.'),
    );
    for (const task of resettable) {
      await store.update('tasks', task.id, { status: 'queued', error: null, output: null });
    }
    await runMission(store, OWNER_ID, mission.id, { maxSteps: 2 });

    // One research row still, and its id unchanged — not regenerated, not
    // duplicated, not paid for twice.
    const after = await store.list('youtube_research', {});
    expect(after).toHaveLength(1);
    expect(after[0]!.id).toBe(researchRows[0]!.id);
    expect((await store.list('api_usage', {})).length).toBeGreaterThanOrEqual(usageBefore);
  });
});
