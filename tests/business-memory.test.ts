import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  businessMemoryBrief,
  businessOutcomes,
  priorTopics,
  recordMissionOutcome,
  successScore,
} from '@/lib/memory/business';
import { runMission } from '@/lib/workflows/runner';
import { createMission } from '@/lib/workflows/engine';
import { uuid } from '@/lib/ids';
import { makeWorkspace, makeBusiness, OWNER_ID } from './helpers';
import type { DataStore } from '@/lib/db/tables';
import type { Mission } from '@/types/domain';

/**
 * Business Intelligence Memory — what a business learns by doing.
 *
 * The value of this feature and its danger are the same thing: agents read it
 * and believe it. So most of what is tested here is restraint. A mission
 * completing is not an audience watching, and a workspace that seeds plausible
 * numbers for work nobody measured teaches its own agents to be confident about
 * fiction.
 */

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
  vi.stubEnv('ANTHROPIC_API_KEY', '');
});

const HOUR = 60 * 60 * 1000;

async function completedMission(
  store: DataStore,
  businessId: string | null,
  overrides: Partial<Mission> = {},
): Promise<Mission> {
  const created = new Date(Date.now() - HOUR).toISOString();
  const mission: Mission = {
    id: uuid(),
    owner_id: OWNER_ID,
    business_id: businessId,
    number: 1,
    title: 'The episode that vanished',
    objective: 'Produce one full video',
    status: 'completed',
    priority: 'normal',
    target_date: null,
    target_time: null,
    workflow_definition_id: null,
    context: {},
    progress: 100,
    is_demo: false,
    created_at: created,
    updated_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
    ...overrides,
  };
  await store.insert('missions', mission);
  return mission;
}

async function costedTask(store: DataStore, mission: Mission, cost: number) {
  const timestamp = new Date().toISOString();
  const task = {
    id: uuid(),
    owner_id: OWNER_ID,
    mission_id: mission.id,
    business_id: mission.business_id,
    agent_id: null,
    step_key: 'step',
    title: 'A step',
    description: '',
    status: 'completed' as const,
    priority: 'normal' as const,
    input: {},
    output: null,
    error: null,
    progress: 100,
    is_demo: false,
    created_at: timestamp,
    started_at: timestamp,
    completed_at: timestamp,
    due_at: null,
  };
  await store.insert('tasks', task);
  await store.insert('api_usage', {
    id: uuid(),
    owner_id: OWNER_ID,
    business_id: mission.business_id,
    agent_id: null,
    task_id: task.id,
    provider: 'anthropic',
    model: 'claude-sonnet-4-5',
    input_tokens: 1000,
    output_tokens: 1000,
    estimated_cost: cost,
    duration_ms: 5000,
    is_demo: false,
    created_at: timestamp,
  });
  return task;
}

/* ------------------------------------------------------------------ */

describe('recording an outcome', () => {
  it('records what a completed mission was and what it cost', async () => {
    const { store, business } = await makeWorkspace();
    const mission = await completedMission(store, business.id);
    await costedTask(store, mission, 0.18);
    await costedTask(store, mission, 0.07);

    const outcome = await recordMissionOutcome(store, mission);

    expect(outcome).not.toBeNull();
    expect(outcome!.topic).toBe('The episode that vanished');
    expect(outcome!.business_kind).toBe(business.kind);
    expect(outcome!.ai_cost).toBeCloseTo(0.25, 4);
    expect(outcome!.minutes_taken).toBeGreaterThan(50);
    expect(outcome!.difficulty).toBeGreaterThan(0);
  });

  it('leaves every performance figure null, because nobody has measured them', async () => {
    const { store, business } = await makeWorkspace();
    const outcome = (await recordMissionOutcome(
      store,
      await completedMission(store, business.id),
    ))!;

    for (const field of [
      'views',
      'impressions',
      'ctr',
      'thumbnail_ctr',
      'watch_time_minutes',
      'average_view_percentage',
      'comments',
      'units_sold',
      'conversion_rate',
      'revenue',
      'rpm',
      'published_at',
      // A mission finishing is not the work succeeding.
      'success_score',
    ] as const) {
      expect(outcome[field], `${field} should be null until it is measured`).toBeNull();
    }
  });

  it('records nothing for a mission that has not completed', async () => {
    const { store, business } = await makeWorkspace();
    const mission = await completedMission(store, business.id, {
      status: 'running',
      completed_at: null,
    });
    expect(await recordMissionOutcome(store, mission)).toBeNull();
  });

  it('is idempotent, so a re-run cannot count the same work twice', async () => {
    const { store, business } = await makeWorkspace();
    const mission = await completedMission(store, business.id);
    await costedTask(store, mission, 0.1);

    await recordMissionOutcome(store, mission);
    await costedTask(store, mission, 0.4);
    const second = await recordMissionOutcome(store, mission);

    const rows = await store.list('mission_outcomes', { where: { mission_id: mission.id } });
    expect(rows).toHaveLength(1);
    // Production facts refresh; the row is updated rather than duplicated.
    expect(second!.ai_cost).toBeCloseTo(0.5, 4);
  });

  it('names the video it produced rather than the mission title', async () => {
    const { store, business } = await makeWorkspace();
    const mission = await completedMission(store, business.id);
    const videoId = uuid();
    await store.insert('youtube_videos', {
      id: videoId,
      business_id: business.id,
      channel_id: null,
      idea_id: null,
      script_id: null,
      mission_id: mission.id,
      number: 1,
      title: 'The banned Pokémon episode',
      status: 'ready',
      stage: 'publish',
      blocked_reason: null,
      alternative_titles: [],
      selected_thumbnail_id: null,
      thumbnail_asset_id: null,
      final_asset_id: null,
      voiceover_id: null,
      timeline_id: null,
      metadata_id: null,
      estimated_cost: 0,
      actual_cost: 0,
      published_external_id: null,
      publish_at: null,
      is_demo: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const outcome = (await recordMissionOutcome(store, mission))!;
    expect(outcome.topic).toBe('The banned Pokémon episode');
    expect(outcome.entity_kind).toBe('youtube_video');
    expect(outcome.entity_id).toBe(videoId);
  });
});

/* ------------------------------------------------------------------ */

describe('enrichment from real analytics', () => {
  it('fills in performance once analytics rows exist, and not before', async () => {
    const { store, business } = await makeWorkspace();
    const mission = await completedMission(store, business.id);
    const videoId = uuid();
    const scriptId = uuid();
    const timestamp = new Date().toISOString();

    await store.insert('youtube_scripts', {
      id: scriptId,
      business_id: business.id,
      idea_id: null,
      research_id: null,
      task_id: null,
      title: 'Script',
      sections: [],
      word_count: 1000,
      estimated_duration_seconds: 600,
      tone: 'documentary',
      audience: 'adults',
      goal: 'explain',
      status: 'approved',
      version: 1,
      is_demo: false,
      created_at: timestamp,
      updated_at: timestamp,
    });
    await store.insert('youtube_videos', {
      id: videoId,
      business_id: business.id,
      channel_id: null,
      idea_id: null,
      script_id: scriptId,
      mission_id: mission.id,
      number: 1,
      title: 'A published video',
      status: 'published',
      stage: 'publish',
      blocked_reason: null,
      alternative_titles: [],
      selected_thumbnail_id: null,
      thumbnail_asset_id: null,
      final_asset_id: null,
      voiceover_id: null,
      timeline_id: null,
      metadata_id: null,
      estimated_cost: 0,
      actual_cost: 0,
      published_external_id: 'abc',
      publish_at: timestamp,
      is_demo: false,
      created_at: timestamp,
      updated_at: timestamp,
    });

    await recordMissionOutcome(store, mission);

    // Before any analytics: still unknown.
    expect((await businessOutcomes(store, business.id))[0]!.views).toBeNull();

    for (const [views, impressions] of [
      [6000, 60_000],
      [4000, 40_000],
    ]) {
      await store.insert('youtube_analytics', {
        id: uuid(),
        business_id: business.id,
        video_id: videoId,
        channel_id: null,
        date: '2026-01-01',
        views,
        impressions,
        ctr: 0.1,
        watch_time_minutes: views * 4,
        average_view_duration_seconds: 300,
        likes: 10,
        comments: 25,
        subscribers_gained: 5,
        revenue: 20,
        is_demo: false,
      });
    }

    const [enriched] = await businessOutcomes(store, business.id);
    expect(enriched!.views).toBe(10_000);
    expect(enriched!.ctr).toBeCloseTo(0.1, 4);
    // 300s of a 600s runtime.
    expect(enriched!.average_view_percentage).toBeCloseTo(0.5, 4);
    expect(enriched!.comments).toBe(50);
    expect(enriched!.revenue).toBeCloseTo(40, 2);
    expect(enriched!.rpm).toBeCloseTo(4, 2);
    expect(enriched!.success_score).toBeGreaterThan(0);

    // And it is persisted, not merely computed for the caller.
    const stored = await store.list('mission_outcomes', { where: { mission_id: mission.id } });
    expect(stored[0]!.views).toBe(10_000);
  });

  it('scores success on an absolute scale, so nothing grades on its own curve', () => {
    expect(successScore({ views: 0, revenue: 0 })).toBe(0);
    expect(successScore({ views: 10_000, revenue: 50 })).toBe(100);
    // Capped, so one runaway video does not make every later one look bad.
    expect(successScore({ views: 10_000_000, revenue: 10_000 })).toBe(100);
  });
});

/* ------------------------------------------------------------------ */

describe('the brief agents read', () => {
  it('says nothing at all when there is nothing to say', async () => {
    const { store, business } = await makeWorkspace();
    expect(await businessMemoryBrief(store, business.id)).toBe('');
    expect(await businessMemoryBrief(store, null)).toBe('');
  });

  it('lists what has been covered and refuses to imply how it did', async () => {
    const { store, business } = await makeWorkspace();
    for (const title of ['The banned episode', 'The lost beta', 'The unused starter']) {
      const mission = await completedMission(store, business.id, { title });
      await costedTask(store, mission, 0.2);
      await recordMissionOutcome(store, mission);
    }

    const brief = await businessMemoryBrief(store, business.id);
    expect(brief).toContain('The banned episode');
    expect(brief).toContain('The lost beta');
    expect(brief).toContain('do not repeat');
    // The honesty clause: no figures exist, and the brief says so rather than
    // leaving an agent to assume the work went well.
    expect(brief).toMatch(/No audience or sales figures are known yet/);
    expect(brief).toMatch(/Do not assume/);
    expect(brief).toContain('£0.60');
  });

  it('names the best and weakest work once real figures exist', async () => {
    const { store, business } = await makeWorkspace();

    for (const [title, views] of [
      ['A strong one', 9000],
      ['A weak one', 200],
    ] as const) {
      const mission = await completedMission(store, business.id, { title });
      const videoId = uuid();
      await store.insert('youtube_videos', {
        id: videoId,
        business_id: business.id,
        channel_id: null,
        idea_id: null,
        script_id: null,
        mission_id: mission.id,
        number: 1,
        title,
        status: 'published',
        stage: 'publish',
        blocked_reason: null,
        alternative_titles: [],
        selected_thumbnail_id: null,
        thumbnail_asset_id: null,
        final_asset_id: null,
        voiceover_id: null,
        timeline_id: null,
        metadata_id: null,
        estimated_cost: 0,
        actual_cost: 0,
        published_external_id: 'x',
        publish_at: new Date().toISOString(),
        is_demo: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      await store.insert('youtube_analytics', {
        id: uuid(),
        business_id: business.id,
        video_id: videoId,
        channel_id: null,
        date: '2026-01-01',
        views,
        impressions: views * 10,
        ctr: 0.1,
        watch_time_minutes: views,
        average_view_duration_seconds: 60,
        likes: 1,
        comments: 1,
        subscribers_gained: 1,
        revenue: 1,
        is_demo: false,
      });
      await recordMissionOutcome(store, mission);
    }

    const brief = await businessMemoryBrief(store, business.id);
    expect(brief).toContain('Best so far: "A strong one"');
    expect(brief).toContain('Weakest so far: "A weak one"');
    expect(brief).toMatch(/Average click-through/);
    expect(brief).toMatch(/Use this as evidence, not as instruction/);
  });

  it('keeps one business’s knowledge out of another’s prompt', async () => {
    const { store, business } = await makeWorkspace();
    const other = makeBusiness({ name: 'Etsy shop', slug: 'etsy', kind: 'etsy' });
    await store.insert('businesses', other);

    await recordMissionOutcome(
      store,
      await completedMission(store, business.id, { title: 'A YouTube topic' }),
    );
    await recordMissionOutcome(
      store,
      await completedMission(store, other.id, { title: 'A sticker range' }),
    );

    const youtube = await businessMemoryBrief(store, business.id);
    const etsy = await businessMemoryBrief(store, other.id);

    expect(youtube).toContain('A YouTube topic');
    expect(youtube).not.toContain('A sticker range');
    expect(etsy).toContain('A sticker range');
    expect(etsy).not.toContain('A YouTube topic');
  });

  it('exposes the covered topics for the originality measure', async () => {
    const { store, business } = await makeWorkspace();
    await recordMissionOutcome(
      store,
      await completedMission(store, business.id, { title: 'The banned episode' }),
    );
    expect(await priorTopics(store, business.id)).toEqual(['The banned episode']);
    expect(await priorTopics(store, null)).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */

describe('recording happens on its own', () => {
  it('writes an outcome when a mission completes through the runner', async () => {
    const { store, business } = await makeWorkspace();
    const { mission } = await createMission(store, {
      ownerId: OWNER_ID,
      businessId: business.id,
      title: 'Ten ideas for the channel',
      objective: 'Generate ideas',
      workflowKey: 'youtube_ideas',
    });

    await runMission(store, OWNER_ID, mission.id);

    expect((await store.get('missions', mission.id))!.status).toBe('completed');

    // Nobody called `recordMissionOutcome` — completing the mission did.
    const rows = await store.list('mission_outcomes', { where: { mission_id: mission.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.topic).toBe('Ten ideas for the channel');
    expect(rows[0]!.ai_cost).toBeGreaterThanOrEqual(0);
  });

  it('reaches every agent through the run context rather than per capability', async () => {
    // The brief is loaded once, onto the context, so a capability written next
    // year gets it without knowing it exists.
    const { store, business } = await makeWorkspace();
    await recordMissionOutcome(
      store,
      await completedMission(store, business.id, { title: 'Something already covered' }),
    );

    const brief = await businessMemoryBrief(store, business.id);
    expect(brief).toContain('Something already covered');
  });
});
