import 'server-only';
import { uuid } from '@/lib/ids';
import { optionalId } from '@/lib/db/validate';
import type { DataStore } from '@/lib/db/tables';
import type { Business, Mission, MissionOutcome, Task } from '@/types/domain';

/**
 * Business Intelligence Memory — what a business has learned by doing.
 *
 * Two kinds of memory now exist and they are deliberately different things:
 *
 * - `agent_memory` holds **rules**. An agent proposed one, an operator approved
 *   it, and it shapes every later run. It is opinion that someone signed off.
 * - `mission_outcomes` — this file — holds **outcomes**. Nobody had to agree to
 *   them; they happened. What was made, what it cost, how long it took, and
 *   once the numbers exist, how it actually did.
 *
 * The second is what stops a workspace repeating itself. A researcher that can
 * see the eleven topics already covered will not propose a twelfth version of
 * the third; a scriptwriter that can see which of them held an audience has
 * something better than a heuristic to work from.
 *
 * Three properties make it safe to feed straight into prompts:
 *
 * 1. **Nothing is invented.** Every performance figure is null until a real
 *    analytics row fills it, and the brief says "not yet known" rather than
 *    quietly omitting it. An agent told a video did well when nobody measured
 *    it will confidently repeat whatever produced it.
 * 2. **It is per business.** A YouTube channel's history never reaches an Etsy
 *    agent's prompt, and two channels under one account stay separate. Each
 *    business accumulates its own knowledge because each one is a different
 *    audience.
 * 3. **It is bounded.** The brief is capped, so a workspace with a thousand
 *    finished missions costs the same per prompt as one with ten.
 */

const now = () => new Date().toISOString();

/* ------------------------------------------------------------------ */
/* Recording                                                           */
/* ------------------------------------------------------------------ */

/**
 * Writes the outcome of a mission that has just completed.
 *
 * Idempotent by mission: re-running a completion updates the existing row. The
 * unique index in migration 0007 enforces the same thing in the database, so a
 * double-completion cannot double-count a video in every average the agents
 * later read.
 */
export async function recordMissionOutcome(
  store: DataStore,
  mission: Mission,
): Promise<MissionOutcome | null> {
  if (mission.status !== 'completed') return null;

  const business = mission.business_id
    ? await store.get('businesses', mission.business_id).catch(() => null)
    : null;
  const tasks = await store
    .list('tasks', { where: { mission_id: mission.id } })
    .catch(() => [] as Task[]);

  const usage = (
    await Promise.all(
      tasks.map((task) =>
        store.list('api_usage', { where: { task_id: task.id } }).catch(() => []),
      ),
    )
  ).flat();
  const aiCost = usage.reduce((total, row) => total + row.estimated_cost, 0);

  const approvals = await store
    .list('approvals', { where: { mission_id: mission.id } })
    .catch(() => []);

  const entity = await produced(store, mission, tasks);
  const timestamp = now();
  const existing = (
    await store.list('mission_outcomes', { where: { mission_id: mission.id } }).catch(() => [])
  )[0];

  const shape = {
    owner_id: mission.owner_id,
    business_id: mission.business_id,
    mission_id: mission.id,
    topic: entity?.topic ?? mission.title,
    category: categoryOf(mission, business),
    business_kind: business?.kind ?? 'general',
    entity_kind: entity?.kind ?? null,
    entity_id: optionalId(entity?.id ?? null),
    published_at: null,
    views: null,
    impressions: null,
    ctr: null,
    thumbnail_ctr: null,
    watch_time_minutes: null,
    average_view_percentage: null,
    comments: null,
    units_sold: null,
    conversion_rate: null,
    revenue: null,
    rpm: null,
    ai_cost: Number(aiCost.toFixed(4)),
    minutes_taken: elapsedMinutes(mission),
    difficulty: difficultyOf(tasks, approvals.length),
    // Deliberately null. The mission finished; that is not the same as the work
    // having succeeded, and nobody knows yet whether it did.
    success_score: null,
    notes: [] as string[],
    is_demo: mission.is_demo,
    updated_at: timestamp,
  };

  if (existing) {
    // Performance already learned is never overwritten by a re-record — the
    // production facts refresh, the audience facts stay.
    return store.update('mission_outcomes', existing.id, {
      topic: shape.topic,
      category: shape.category,
      entity_kind: shape.entity_kind,
      entity_id: shape.entity_id,
      ai_cost: shape.ai_cost,
      minutes_taken: shape.minutes_taken,
      difficulty: shape.difficulty,
      updated_at: timestamp,
    });
  }

  return store.insert('mission_outcomes', {
    id: uuid(),
    ...shape,
    created_at: timestamp,
  });
}

/** The durable thing the mission produced, if it produced one. */
async function produced(
  store: DataStore,
  mission: Mission,
  tasks: Task[],
): Promise<{ kind: string; id: string; topic: string } | null> {
  const videos = await store
    .list('youtube_videos', { where: { mission_id: mission.id } })
    .catch(() => []);
  if (videos[0]) {
    return { kind: 'youtube_video', id: videos[0].id, topic: videos[0].title };
  }

  // Otherwise take whatever the last completed task named, which covers scripts,
  // listings and anything a business added later without changing this file.
  for (const key of ['listing_id', 'script_id', 'research_id'] as const) {
    for (const task of tasks) {
      const value = task.output?.[key];
      if (typeof value === 'string' && value.length > 0) {
        return { kind: key.replace(/_id$/, ''), id: value, topic: mission.title };
      }
    }
  }
  return null;
}

function elapsedMinutes(mission: Mission): number | null {
  if (!mission.completed_at) return null;
  const minutes =
    (Date.parse(mission.completed_at) - Date.parse(mission.created_at)) / 60_000;
  return Number.isFinite(minutes) && minutes >= 0 ? Number(minutes.toFixed(2)) : null;
}

/**
 * How hard this was, 0–100.
 *
 * Measured from what the mission actually needed: how many steps, how many of
 * them failed and had to be re-run, and how many times it stopped to ask a
 * person. It is a production measure, not a judgement of the subject.
 */
function difficultyOf(tasks: Task[], approvals: number): number {
  const steps = tasks.length;
  const failed = tasks.filter((task) => task.status === 'failed').length;
  const raw = steps * 4 + failed * 18 + approvals * 8;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

/** A coarse grouping an agent can compare across. */
function categoryOf(mission: Mission, business: Business | null): string {
  const context = mission.context as Record<string, unknown>;
  const declared = context?.category;
  if (typeof declared === 'string' && declared.trim()) return declared.trim();
  return business?.kind ?? 'general';
}

/* ------------------------------------------------------------------ */
/* Enrichment                                                          */
/* ------------------------------------------------------------------ */

/**
 * Fills in performance from whatever analytics the workspace actually holds.
 *
 * Pull rather than push: analytics arrive from a provider on their own
 * schedule, long after the mission ended, and a sync hook that had to remember
 * to update outcomes would eventually forget. Reading them at brief time means
 * the memory is current by construction.
 *
 * Only real rows are read. A business with no analytics connected gets outcomes
 * with null figures and a brief that says the numbers are not known yet.
 */
export async function refreshOutcomes(
  store: DataStore,
  outcomes: MissionOutcome[],
): Promise<MissionOutcome[]> {
  const updated: MissionOutcome[] = [];

  for (const outcome of outcomes) {
    const performance = await performanceFor(store, outcome);
    if (!performance) {
      updated.push(outcome);
      continue;
    }
    updated.push(
      await store
        .update('mission_outcomes', outcome.id, { ...performance, updated_at: now() })
        .catch(() => ({ ...outcome, ...performance })),
    );
  }

  return updated;
}

async function performanceFor(
  store: DataStore,
  outcome: MissionOutcome,
): Promise<Partial<MissionOutcome> | null> {
  if (!outcome.entity_id) return null;

  if (outcome.entity_kind === 'youtube_video') {
    const rows = await store
      .list('youtube_analytics', { where: { video_id: outcome.entity_id } })
      .catch(() => []);
    if (rows.length === 0) return null;

    // Analytics arrive daily; the lifetime figure is their sum.
    const views = rows.reduce((total, row) => total + row.views, 0);
    const impressions = rows.reduce((total, row) => total + row.impressions, 0);
    const watch = rows.reduce((total, row) => total + row.watch_time_minutes, 0);
    const comments = rows.reduce((total, row) => total + row.comments, 0);
    const revenue = rows.reduce((total, row) => total + row.revenue, 0);
    const duration =
      rows.reduce((total, row) => total + row.average_view_duration_seconds * row.views, 0) /
      Math.max(1, views);

    const video = await store.get('youtube_videos', outcome.entity_id).catch(() => null);
    const runtime = video?.script_id
      ? ((await store.get('youtube_scripts', video.script_id).catch(() => null))
          ?.estimated_duration_seconds ?? null)
      : null;

    return {
      views,
      impressions,
      ctr: impressions > 0 ? Number((views / impressions).toFixed(4)) : null,
      thumbnail_ctr: impressions > 0 ? Number((views / impressions).toFixed(4)) : null,
      watch_time_minutes: Number(watch.toFixed(2)),
      average_view_percentage:
        runtime && runtime > 0 ? Number(Math.min(1, duration / runtime).toFixed(4)) : null,
      comments,
      revenue: Number(revenue.toFixed(2)),
      rpm: views > 0 ? Number(((revenue / views) * 1000).toFixed(2)) : null,
      published_at: video?.publish_at ?? outcome.published_at,
      success_score: successScore({ views, revenue }),
    };
  }

  // Etsy analytics are recorded per store and per day, not per listing, so
  // there is no honest way to attribute them to one piece of work. Rather than
  // divide a store's takings by its listings and call the result a measurement,
  // commerce outcomes stay null until per-listing figures exist. The brief then
  // says the numbers are not known, which is true.
  return null;
}

/**
 * 0–100, from figures that exist.
 *
 * Deliberately crude and deliberately absolute rather than relative: a score
 * that grades a business against its own worst month would call anything an
 * improvement. Ten thousand views or fifty pounds is treated as a strong
 * outcome for one piece of work; the scale is stated in the brief so an agent
 * reading it knows what a 60 means.
 */
export function successScore(input: { views: number; revenue: number }): number {
  const audience = Math.min(70, (input.views / 10_000) * 70);
  const money = Math.min(30, (input.revenue / 50) * 30);
  return Math.round(audience + money);
}

/* ------------------------------------------------------------------ */
/* Reading back                                                        */
/* ------------------------------------------------------------------ */

/** How much history any one prompt is allowed to carry. */
const BRIEF_LIMIT = 25;

export async function businessOutcomes(
  store: DataStore,
  businessId: string | null,
  limit = BRIEF_LIMIT,
): Promise<MissionOutcome[]> {
  if (!businessId) return [];
  const rows = await store
    .list('mission_outcomes', {
      where: { business_id: businessId },
      orderBy: { column: 'created_at', ascending: false },
      limit,
    })
    .catch(() => []);
  return refreshOutcomes(store, rows);
}

/** Topics this business has already covered, newest first. */
export async function priorTopics(
  store: DataStore,
  businessId: string | null,
  limit = BRIEF_LIMIT,
): Promise<string[]> {
  if (!businessId) return [];
  const rows = await store
    .list('mission_outcomes', {
      where: { business_id: businessId },
      orderBy: { column: 'created_at', ascending: false },
      limit,
    })
    .catch(() => []);
  return rows.map((row) => row.topic).filter((topic) => topic.trim().length > 0);
}

const money = (value: number) => `£${value.toFixed(2)}`;
const percent = (value: number) => `${(value * 100).toFixed(1)}%`;

/**
 * The business's own history, rendered for a prompt.
 *
 * Written for any agent, not for a particular one. A researcher reads the topic
 * list and avoids repeats; a scriptwriter reads the retention figures and knows
 * what held people; a thumbnail agent reads the click-through rates. Nobody had
 * to write a per-agent integration, which is what makes it apply automatically
 * to agents that do not exist yet.
 *
 * Returns an empty string when there is nothing to say, so a new workspace does
 * not carry a paragraph explaining that it knows nothing.
 */
export async function businessMemoryBrief(
  store: DataStore,
  businessId: string | null,
): Promise<string> {
  const outcomes = await businessOutcomes(store, businessId);
  if (outcomes.length === 0) return '';

  const lines: string[] = ['What this business has learned from its own completed work:'];

  const measured = outcomes.filter((row) => row.views !== null);
  const covered = outcomes.slice(0, 12).map((row) => row.topic);

  lines.push(
    `- ${outcomes.length} completed piece${outcomes.length === 1 ? '' : 's'} of work so far.`,
  );
  lines.push(`- Already covered — do not repeat these unless asked: ${covered.join('; ')}.`);

  if (measured.length === 0) {
    lines.push(
      '- No audience or sales figures are known yet for any of it. Do not assume any of the above performed well or badly.',
    );
  } else {
    const ranked = [...measured].sort(
      (a, b) => (b.success_score ?? 0) - (a.success_score ?? 0),
    );
    const best = ranked[0]!;
    const worst = ranked[ranked.length - 1]!;

    lines.push(
      `- Measured performance exists for ${measured.length} of them (scale: 100 ≈ 10,000 views plus £50).`,
    );
    lines.push(`- Best so far: "${best.topic}" — ${describe(best)}.`);
    if (ranked.length > 1) {
      lines.push(`- Weakest so far: "${worst.topic}" — ${describe(worst)}.`);
    }

    const withCtr = measured.filter((row) => row.ctr !== null);
    if (withCtr.length > 0) {
      const mean =
        withCtr.reduce((total, row) => total + (row.ctr ?? 0), 0) / withCtr.length;
      lines.push(
        `- Average click-through across ${withCtr.length} measured piece${withCtr.length === 1 ? '' : 's'}: ${percent(mean)}.`,
      );
    }

    const withRetention = measured.filter((row) => row.average_view_percentage !== null);
    if (withRetention.length > 0) {
      const mean =
        withRetention.reduce((total, row) => total + (row.average_view_percentage ?? 0), 0) /
        withRetention.length;
      lines.push(`- Average watched-through: ${percent(mean)} of the runtime.`);
    }

    const withPublished = measured.filter((row) => row.published_at);
    if (withPublished.length >= 3) {
      const days = withPublished.map((row) =>
        new Date(row.published_at!).toLocaleDateString('en-GB', { weekday: 'long' }),
      );
      const best = mode(days);
      if (best) lines.push(`- Most of the measured work was published on a ${best}.`);
    }
  }

  const cost = outcomes.reduce((total, row) => total + row.ai_cost, 0);
  const times = outcomes
    .map((row) => row.minutes_taken)
    .filter((value): value is number => value !== null);
  lines.push(
    `- Cost so far: ${money(cost)} across ${outcomes.length}, averaging ${money(cost / outcomes.length)} each${
      times.length > 0
        ? ` and ${(times.reduce((a, b) => a + b, 0) / times.length).toFixed(0)} minutes each`
        : ''
    }.`,
  );

  const notes = outcomes.flatMap((row) => row.notes).slice(0, 6);
  if (notes.length > 0) {
    lines.push(`- Noted along the way: ${notes.join('; ')}.`);
  }

  lines.push(
    'Use this as evidence, not as instruction. Where it does not cover the task, say so rather than extrapolating from it.',
  );

  return lines.join('\n');
}

function describe(outcome: MissionOutcome): string {
  const parts: string[] = [];
  if (outcome.views !== null) parts.push(`${outcome.views.toLocaleString('en-GB')} views`);
  if (outcome.ctr !== null) parts.push(`${percent(outcome.ctr)} click-through`);
  if (outcome.average_view_percentage !== null) {
    parts.push(`${percent(outcome.average_view_percentage)} watched`);
  }
  if (outcome.units_sold !== null) parts.push(`${outcome.units_sold} sold`);
  if (outcome.revenue !== null) parts.push(`${money(outcome.revenue)}`);
  return parts.length > 0 ? parts.join(', ') : 'no figures recorded';
}

function mode(values: string[]): string | null {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  let best: string | null = null;
  let most = 0;
  for (const [value, count] of counts) {
    if (count > most) {
      most = count;
      best = value;
    }
  }
  return most > 1 ? best : null;
}
