import 'server-only';
import type { DataStore, TableName } from '@/lib/db/tables';
import type { Mission, Task } from '@/types/domain';

/**
 * The mission graph, edge by edge, with the records each edge actually touched.
 *
 * Built because "the script disappeared" turned out not to be true, and there
 * was no way to establish that without reading five tables by hand. A step
 * reports what it was given, what it wrote, and — the part that matters —
 * whether every id it emitted still resolves to a row.
 *
 * A dangling id is the whole diagnostic. It distinguishes "the row was removed"
 * from "the row was never written" from "the id was never valid", and those
 * three have completely different causes. Reading it should make the next bug
 * of this shape a one-minute question rather than an afternoon.
 *
 * Read-only. It calls no provider and writes nothing.
 */

/** Output keys that name a row, and the table that row lives in. */
const REFERENCES: Record<string, TableName> = {
  research_id: 'youtube_research',
  script_id: 'youtube_scripts',
  fact_check_id: 'youtube_fact_checks',
  idea_id: 'youtube_ideas',
  video_id: 'youtube_videos',
  voiceover_id: 'youtube_voiceovers',
  timeline_id: 'youtube_timelines',
  metadata_id: 'youtube_metadata',
  listing_id: 'etsy_listings',
  product_id: 'etsy_products',
  resolution_id: 'source_resolutions',
  memory_id: 'agent_memory',
};

export interface TracedReference {
  key: string;
  table: TableName;
  id: string | null;
  /** null when there was no id to check. */
  resolves: boolean | null;
  note: string;
}

export interface TracedEdge {
  stepKey: string;
  taskId: string;
  title: string;
  capability: string | null;
  status: Task['status'];
  agent: string | null;
  error: string | null;
  dependsOn: string[];
  /** Ids handed to the step. */
  inputs: TracedReference[];
  /** Ids the step produced. */
  outputs: TracedReference[];
  /** The approval this step raised, if any. */
  approval: {
    id: string;
    kind: string;
    status: string;
    /** Ids inside the payload, and whether they still resolve. */
    payload: TracedReference[];
  } | null;
}

export interface MissionTrace {
  mission: { id: string; number: number; title: string; status: string };
  edges: TracedEdge[];
  /** Every script this mission produced, whether or not anything references it. */
  scripts: {
    id: string;
    version: number;
    status: string;
    words: number;
    versionsArchived: number;
    updatedAt: string;
  }[];
  /** Ids that are referenced somewhere and resolve to nothing. */
  dangling: { where: string; key: string; table: TableName; id: string }[];
  summary: string;
}

export async function traceMission(
  store: DataStore,
  mission: Mission,
): Promise<MissionTrace> {
  const [tasks, dependencies, approvals, agents] = await Promise.all([
    store.list('tasks', { where: { mission_id: mission.id } }).catch(() => []),
    store.list('task_dependencies').catch(() => []),
    store.list('approvals', { where: { mission_id: mission.id } }).catch(() => []),
    store.list('agents').catch(() => []),
  ]);

  const byId = new Map(tasks.map((task) => [task.id, task]));
  const agentName = (id: string | null) =>
    id ? (agents.find((agent) => agent.id === id)?.name ?? id) : null;
  const dangling: MissionTrace['dangling'] = [];

  const check = async (
    where: string,
    source: Record<string, unknown> | null,
  ): Promise<TracedReference[]> => {
    const out: TracedReference[] = [];
    for (const [key, table] of Object.entries(REFERENCES)) {
      if (!source || !(key in source)) continue;
      const raw = source[key];
      if (raw === null || raw === undefined) {
        out.push({ key, table, id: null, resolves: null, note: 'null' });
        continue;
      }
      if (typeof raw !== 'string' || raw.trim() === '') {
        out.push({
          key,
          table,
          id: String(raw),
          resolves: false,
          note: 'not a usable id — this is a producer bug, not a missing row',
        });
        continue;
      }
      const row = await store.get(table, raw).catch(() => null);
      if (!row) dangling.push({ where, key, table, id: raw });
      out.push({
        key,
        table,
        id: raw,
        resolves: Boolean(row),
        note: row ? 'resolves' : 'DANGLING — referenced but no row exists',
      });
    }
    return out;
  };

  const ordered = [...tasks].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const edges: TracedEdge[] = [];

  for (const task of ordered) {
    const raised = approvals.find((approval) => approval.task_id === task.id) ?? null;
    edges.push({
      stepKey: task.step_key ?? task.id,
      taskId: task.id,
      title: task.title,
      capability: typeof task.input.capability === 'string' ? task.input.capability : null,
      status: task.status,
      agent: agentName(task.agent_id),
      error: task.error,
      dependsOn: dependencies
        .filter((dependency) => dependency.task_id === task.id)
        .map((dependency) => byId.get(dependency.depends_on_task_id)?.step_key ?? '(outside)'),
      inputs: await check(`task ${task.step_key ?? task.id} input`, task.input),
      outputs: await check(`task ${task.step_key ?? task.id} output`, task.output),
      approval: raised
        ? {
            id: raised.id,
            kind: raised.kind,
            status: raised.status,
            payload: await check(`approval ${raised.id} payload`, raised.payload),
          }
        : null,
    });
  }

  // Every script belonging to this mission, found by walking its tasks rather
  // than by following references — so a script nothing points at still appears.
  const owned = tasks.length
    ? await store
        .list('youtube_scripts', { where: { task_id: tasks.map((task) => task.id) } })
        .catch(() => [])
    : [];
  const scripts = await Promise.all(
    owned.map(async (script) => ({
      id: script.id,
      version: script.version,
      status: script.status,
      words: script.word_count,
      versionsArchived: (
        await store
          .list('youtube_script_versions', { where: { script_id: script.id } })
          .catch(() => [])
      ).length,
      updatedAt: script.updated_at,
    })),
  );

  return {
    mission: {
      id: mission.id,
      number: mission.number,
      title: mission.title,
      status: mission.status,
    },
    edges,
    scripts,
    dangling,
    summary: summarise(scripts.length, dangling),
  };
}

function summarise(scripts: number, dangling: MissionTrace['dangling']): string {
  if (dangling.length === 0) {
    return `Every referenced record resolves. ${scripts} script${scripts === 1 ? '' : 's'} belong to this mission.`;
  }
  const tables = [...new Set(dangling.map((entry) => entry.table))].join(', ');
  return [
    `${dangling.length} reference${dangling.length === 1 ? '' : 's'} point at rows that do not exist (${tables}).`,
    scripts > 0
      ? `The mission does still own ${scripts} script${scripts === 1 ? '' : 's'}, so the work exists and the reference is what is wrong.`
      : 'This mission owns no script rows at all, so the script step never wrote one — the missing reference is a symptom, not the cause.',
  ].join(' ');
}
