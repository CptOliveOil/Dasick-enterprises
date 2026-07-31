import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryStore } from '@/lib/db/memory-store';
import { runAgent } from '@/lib/agents/engine';
import { handleCommand } from '@/lib/agents/manager';
import { buildApprovalReview, humanise, itemFromRecord, readable } from '@/lib/approvals/review';
import { uuid } from '@/lib/ids';
import { makePokemonWorkspace, OWNER_ID } from './helpers';
import type { Approval } from '@/types/domain';

/**
 * The guarantee: an operator is never asked to approve work they cannot see.
 *
 * The bug this closes shipped a card reading "found 5 Pokémon video
 * opportunities" with no way to read any of the five. A summary is not a
 * decision — without the work itself, approving is a rubber stamp.
 */

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
  vi.stubEnv('ANTHROPIC_API_KEY', '');
});

function approval(overrides: Partial<Approval>): Approval {
  const timestamp = new Date().toISOString();
  return {
    id: uuid(),
    owner_id: OWNER_ID,
    business_id: null,
    mission_id: null,
    task_id: null,
    agent_id: null,
    kind: 'generic',
    title: 'Something to decide',
    summary: 'A summary',
    payload: {},
    status: 'pending',
    feedback: null,
    resolved_at: null,
    is_demo: false,
    created_at: timestamp,
    ...overrides,
  } as Approval;
}

/* ------------------------------------------------------------------ */
/* The reported bug                                                    */
/* ------------------------------------------------------------------ */

describe('a generated-content approval shows the generated content', () => {
  it('renders every idea behind "found 5 Pokémon video opportunities"', async () => {
    const { store } = await makePokemonWorkspace();
    const command = await handleCommand(store, OWNER_ID, 'Give me 5 Pokémon YouTube ideas.');

    // The workflow-step approval path the live Manager produces: kind
    // `generic`, payload set to the step's output. This is exactly the shape
    // that rendered as nothing.
    const task = command.tasks[0]!;
    await store.update('tasks', task.id, {
      input: { ...task.input, requires_approval: true, approval_label: 'Approve Pokémon ideas' },
    });
    await runAgent(store, OWNER_ID, task.id);

    const [raised] = await store.list('approvals', { where: { status: 'pending' } });
    expect(raised).toBeDefined();
    expect(raised!.kind).toBe('generic');

    const review = await buildApprovalReview(store, OWNER_ID, raised!);
    const rows = await store.list('pokemon_opportunities', {});

    // One reviewable item per idea generated — not a count, the ideas.
    expect(review.items.length).toBe(rows.length);
    expect(review.items.length).toBeGreaterThan(0);
    expect(review.source).toBe('records');
  });

  it('shows every field the researcher produced, including ones the payload omits', async () => {
    const { store } = await makePokemonWorkspace();
    const command = await handleCommand(store, OWNER_ID, 'Give me 5 Pokémon YouTube ideas.');
    await runAgent(store, OWNER_ID, command.tasks[0]!.id);

    const [row] = await store.list('pokemon_opportunities', {});
    const review = await buildApprovalReview(
      store,
      OWNER_ID,
      approval({ payload: { opportunity_ids: [row!.id], count: 1 } }),
    );

    const item = review.items[0]!;
    const labels = item.fields.map((field) => field.label);

    // The nine the operator asked to see.
    expect(item.title).toBe(row!.title_concept);
    expect(item.subtitle).toBe(row!.hook);
    expect(item.badges?.some((badge) => badge.label === row!.category)).toBe(true);
    expect(labels).toContain('Why watch');
    expect(labels).toContain('Target audience');
    expect(labels).toContain('Suggested minutes');
    expect(labels).toContain('Research required');
    // Confidence is the proof that records beat the payload: the handoff
    // snapshot never carried it, and reading the row back does.
    expect(labels).toContain('Confidence');
    expect(item.badges?.some((badge) => badge.label === row!.lifespan)).toBe(true);
  });

  it('reads what is stored and regenerates nothing', async () => {
    const { store } = await makePokemonWorkspace();
    const command = await handleCommand(store, OWNER_ID, 'Give me 5 Pokémon YouTube ideas.');
    await runAgent(store, OWNER_ID, command.tasks[0]!.id);

    const before = await store.list('pokemon_opportunities', {});
    const usageBefore = await store.list('api_usage', {});

    const [raised] = await store.list('approvals', {});
    await buildApprovalReview(store, OWNER_ID, raised ?? approval({}));
    await buildApprovalReview(store, OWNER_ID, raised ?? approval({}));

    // No new rows, no new model call, no new cost. Reviewing is free.
    expect(await store.list('pokemon_opportunities', {})).toHaveLength(before.length);
    expect(await store.list('api_usage', {})).toHaveLength(usageBefore.length);
  });
});

/* ------------------------------------------------------------------ */
/* Generic, not Pokémon-shaped                                         */
/* ------------------------------------------------------------------ */

describe('the reviewer is generic', () => {
  it('renders a script as its sections', async () => {
    const store = new MemoryStore();
    const scriptId = uuid();
    await store.insert('youtube_scripts', {
      id: scriptId,
      business_id: uuid(),
      idea_id: '',
      research_id: null,
      task_id: null,
      title: 'The lost region',
      sections: [
        { heading: 'Cold open', purpose: 'Hook', body: 'There is a map that leads nowhere.' },
        { heading: 'Act one', purpose: 'Set up', body: 'It was cut three weeks before release.' },
      ],
      word_count: 12,
      estimated_duration_seconds: 5,
      tone: 'calm',
      audience: 'players',
      goal: 'explain',
      status: 'fact_checking',
      version: 1,
      is_demo: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as never);

    const review = await buildApprovalReview(
      store,
      OWNER_ID,
      approval({ kind: 'script', payload: { script_id: scriptId, word_count: 12 } }),
    );

    expect(review.items).toHaveLength(2);
    expect(review.items[0]!.title).toBe('Cold open');
    expect(review.items[0]!.fields[0]!.value).toMatch(/map that leads nowhere/);
    expect(review.href).toBe(`/youtube/scripts/${scriptId}`);
    // And it says what approving does, which for a script is expensive.
    expect(review.action).toMatch(/cost money/i);
  });

  it('renders a memory approval as the rule being proposed', async () => {
    const store = new MemoryStore();
    const memoryId = uuid();
    await store.insert('agent_memory', {
      id: memoryId,
      agent_id: uuid(),
      business_id: null,
      type: 'constraint',
      content: 'Never open a video with a question.',
      importance: 5,
      origin: 'agent',
      status: 'pending',
      pinned: false,
      last_used_at: null,
      created_at: new Date().toISOString(),
    } as never);

    const review = await buildApprovalReview(
      store,
      OWNER_ID,
      approval({ kind: 'memory', payload: { memory_id: memoryId } }),
    );
    expect(review.items[0]!.title).toBe('Never open a video with a question.');
    expect(review.action).toMatch(/durable rule/i);
  });

  it('renders a spend approval as the money involved', async () => {
    const store = new MemoryStore();
    const review = await buildApprovalReview(
      store,
      OWNER_ID,
      approval({ kind: 'spend', payload: { authorise_spend: true, estimate: 0.42 } }),
    );
    expect(review.facts.some((fact) => fact.label === 'Estimated cost')).toBe(true);
    expect(review.action).toMatch(/does not raise any ceiling/i);
  });

  it('never leaves an approval unreviewable, whatever the kind', async () => {
    const store = new MemoryStore();
    // A kind with no resolver and no records: the payload is rendered as
    // itself rather than hidden.
    const review = await buildApprovalReview(
      store,
      OWNER_ID,
      approval({
        kind: 'listing',
        payload: { headline: 'Ramadan planner', price: 4.5, tags: ['ramadan', 'planner'] },
      }),
    );
    expect(review.items.length).toBeGreaterThan(0);
    const values = review.items.flatMap((item) => item.fields.map((field) => field.value));
    expect(values.join(' ')).toMatch(/Ramadan planner/);
    expect(values.join(' ')).toMatch(/planner/);
  });

  it('renders items the payload carries directly when the rows are gone', async () => {
    const store = new MemoryStore();
    const review = await buildApprovalReview(
      store,
      OWNER_ID,
      approval({
        payload: {
          // Ids that resolve to nothing, plus the snapshot the handler carried.
          opportunity_ids: [uuid(), uuid()],
          opportunities: [
            { title_concept: 'The region nobody finished', hook: 'A map that leads nowhere.' },
            { title_concept: 'The card that was never printed', hook: 'It exists in one photo.' },
          ],
        },
      }),
    );
    expect(review.items).toHaveLength(2);
    expect(review.items[0]!.title).toBe('The region nobody finished');
    // And the operator is told they are reading a snapshot, not the work.
    expect(review.source).toBe('payload');
  });

  it('says plainly when there is genuinely nothing to review', async () => {
    const store = new MemoryStore();
    const review = await buildApprovalReview(store, OWNER_ID, approval({ payload: {} }));
    expect(review.items).toHaveLength(0);
    expect(review.source).toBe('none');
  });
});

/* ------------------------------------------------------------------ */
/* Rendering rules                                                     */
/* ------------------------------------------------------------------ */

describe('field rendering', () => {
  it('turns a column name into something a person reads', () => {
    expect(humanise('title_concept')).toBe('Title concept');
    expect(humanise('why_watch')).toBe('Why watch');
  });

  it('renders arrays as lines rather than as [object Object]', () => {
    expect(readable(['one', 'two'])).toBe('one\ntwo');
    expect(readable([])).toBeNull();
    expect(readable('')).toBeNull();
    expect(readable(true)).toBe('Yes');
    expect(readable(0.5)).toBe('0.50');
  });

  it('hides bookkeeping but keeps everything the operator could judge', () => {
    const item = itemFromRecord(
      {
        id: 'abc',
        owner_id: 'someone',
        created_at: 'now',
        is_demo: false,
        title_concept: 'A title',
        why_watch: 'Because it is interesting',
      },
      { titleKey: 'title_concept' },
    );
    const labels = item.fields.map((field) => field.label);
    expect(labels).toEqual(['Why watch']);
    expect(labels).not.toContain('Owner id');
    expect(labels).not.toContain('Created at');
  });

  it('marks long values so they render as paragraphs', () => {
    const item = itemFromRecord(
      { id: '1', title: 'T', body: 'x'.repeat(120) },
      { titleKey: 'title' },
    );
    expect(item.fields[0]!.long).toBe(true);
  });
});

describe('resolving through a parent record', () => {
  it('reviews thumbnail concepts from an approval that only names the video', async () => {
    // The shape that rendered "no reviewable content": the payload carries a
    // parent id and nothing else, while the work hangs off it by foreign key.
    const store = new MemoryStore();
    const videoId = uuid();
    const base = {
      video_id: videoId,
      business_id: uuid(),
      task_id: null,
      is_demo: false,
      created_at: new Date().toISOString(),
    };
    await store.insertMany('youtube_thumbnail_concepts', [
      { ...base, id: uuid(), headline: 'THE MAP THAT LEADS NOWHERE', rationale: 'Curiosity gap' },
      { ...base, id: uuid(), headline: 'CUT THREE WEEKS BEFORE', rationale: 'Specific and odd' },
    ] as never[]);

    const review = await buildApprovalReview(
      store,
      OWNER_ID,
      approval({ kind: 'thumbnail', payload: { video_id: videoId } }),
    );

    expect(review.source).toBe('records');
    expect(review.items).toHaveLength(2);
    expect(review.items[0]!.title).toBe('THE MAP THAT LEADS NOWHERE');
  });

  it('reads the same payload key differently for a video approval', async () => {
    // `video_id` means the video itself here, not its thumbnail concepts.
    const store = new MemoryStore();
    const videoId = uuid();
    await store.insert('youtube_videos', {
      id: videoId,
      business_id: uuid(),
      channel_id: null,
      idea_id: null,
      script_id: null,
      title: 'The region nobody finished',
      description: 'A map that leads nowhere.',
      stage: 'publish',
      status: 'ready',
      blocked_reason: null,
      thumbnail_asset_id: null,
      alternative_titles: [],
      is_demo: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as never);

    const review = await buildApprovalReview(
      store,
      OWNER_ID,
      approval({ kind: 'video', payload: { video_id: videoId, verdict: 'pass' } }),
    );

    expect(review.items).toHaveLength(1);
    expect(review.items[0]!.title).toBe('The region nobody finished');
    expect(review.href).toBe(`/youtube/production/${videoId}`);
    expect(review.facts.some((fact) => fact.value === 'pass')).toBe(true);
  });
});
