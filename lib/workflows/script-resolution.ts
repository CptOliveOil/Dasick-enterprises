import 'server-only';
import { uuid } from '@/lib/ids';
import type { DataStore } from '@/lib/db/tables';
import type { ScriptSection, YoutubeScript, YoutubeScriptVersion } from '@/types/domain';

/**
 * The one way to answer "which script is this mission working on?".
 *
 * Before this file, every step answered that question for itself. The fact
 * checker read `task.input.script_id`, fell back to `previousOutputs.script`,
 * and if both came up empty it fact-checked the literal string
 * "(script unavailable)" and carried on. The reviser read the same two places
 * and threw "No script was supplied to revise." The dossier read the approval
 * payload and, finding nothing, showed the payload snapshot.
 *
 * Three consumers, three different behaviours for the same fault, and none of
 * them said what had actually gone wrong. The visible symptom — a revision step
 * failing — appeared two steps after the point of failure, which is why it
 * looked like the script was being deleted. Nothing deletes scripts. The script
 * was never *found*.
 *
 * So resolution is centralised here, it is ordered from most specific to most
 * general, it falls back to the version archive rather than giving up, and when
 * it genuinely cannot find a script it raises an error naming every place it
 * looked. A step may fail. It may never quietly proceed on nothing.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Where a candidate id came from, in the order the resolver tries them. */
export type ScriptSource =
  | 'task_input'
  | 'previous_step'
  | 'approval_payload'
  | 'mission_tasks'
  | 'archive';

export interface ResolutionAttempt {
  source: ScriptSource;
  id: string | null;
  found: boolean;
  note: string;
}

export interface ScriptResolution {
  script: YoutubeScript;
  via: ScriptSource;
  /**
   * True when the head row had gone and the script was rebuilt from
   * `youtube_script_versions`. Worth surfacing: the work survived, but
   * something removed a row that nothing in this codebase removes.
   */
  restoredFromArchive: boolean;
  attempts: ResolutionAttempt[];
}

/**
 * Raised when no script can be found anywhere.
 *
 * Carries the full search so the message can say which ids were considered and
 * what was found at each one. "No script was supplied" and "the script id was
 * supplied but no row exists" are different faults with different fixes, and
 * the old message covered both.
 */
export class ScriptUnavailable extends Error {
  constructor(
    readonly attempts: ResolutionAttempt[],
    readonly missionId: string | null,
  ) {
    super(describe(attempts, missionId));
    this.name = 'ScriptUnavailable';
  }
}

function describe(attempts: ResolutionAttempt[], missionId: string | null): string {
  if (attempts.length === 0) {
    return 'No script could be resolved for this step, and there was nothing to search — the task carries no script id, no earlier step produced one, and it is not attached to a mission.';
  }
  const lines = attempts.map(
    (attempt) => `  · ${attempt.source}: ${attempt.id ?? '(none)'} — ${attempt.note}`,
  );
  return [
    `No script could be resolved for this step${missionId ? ` on mission ${missionId}` : ''}. Every source was checked:`,
    ...lines,
    'The script record is missing rather than merely unreferenced. Nothing in Command Centre deletes scripts, so this points at the row never having been written, or at it being written under a different business than the one this task belongs to.',
  ].join('\n');
}

export interface ResolutionInput {
  /** `task.input`, whatever it happens to hold. */
  taskInput: Record<string, unknown>;
  /** Completed step outputs, keyed by step key. */
  previousOutputs: Record<string, Record<string, unknown>>;
  missionId: string | null;
  businessId: string | null;
}

/** A usable uuid, or null. Empty strings and junk never leave this function. */
function candidate(value: unknown): string | null {
  return typeof value === 'string' && UUID.test(value.trim()) ? value.trim() : null;
}

/**
 * Finds the script this step should operate on.
 *
 * Order is deliberate: what the task was explicitly told, then what the mission
 * actually produced, then what the operator was shown, then anything belonging
 * to this mission at all. The archive is consulted for any candidate whose head
 * row is missing, so a lost row costs a rebuild rather than the mission.
 */
export async function resolveMissionScript(
  store: DataStore,
  input: ResolutionInput,
): Promise<ScriptResolution> {
  const attempts: ResolutionAttempt[] = [];

  const tryId = async (
    source: ScriptSource,
    id: string | null,
    absent: string,
  ): Promise<ScriptResolution | null> => {
    if (!id) {
      attempts.push({ source, id: null, found: false, note: absent });
      return null;
    }
    const script = await store.get('youtube_scripts', id).catch(() => null);
    if (script) {
      attempts.push({ source, id, found: true, note: `found, version ${script.version}` });
      return { script, via: source, restoredFromArchive: false, attempts };
    }

    // The head row is gone but the drafts may not be. This is the archive layer:
    // every version ever written is kept, so the work survives the row.
    const restored = await restoreFromArchive(store, id, input);
    if (restored) {
      attempts.push({
        source,
        id,
        found: true,
        note: 'head row missing — rebuilt from the version archive',
      });
      return { script: restored, via: source, restoredFromArchive: true, attempts };
    }

    attempts.push({ source, id, found: false, note: 'no row, and no archived version either' });
    return null;
  };

  // 1. What this task was explicitly handed. A rework task carries it directly.
  const fromInput = await tryId(
    'task_input',
    candidate(input.taskInput.script_id),
    input.taskInput.script_id === undefined
      ? 'the task carries no script_id'
      : 'the task carries a script_id that is not a uuid',
  );
  if (fromInput) return fromInput;

  // 2. What an earlier step in this mission produced. Any step key, not just
  //    `script` — a rework step writes its own key and is the newer draft.
  for (const [key, output] of Object.entries(input.previousOutputs)) {
    const id = candidate(output?.script_id);
    if (!id) continue;
    const found = await tryId('previous_step', id, `step "${key}" produced no script id`);
    if (found) return found;
  }
  if (!Object.values(input.previousOutputs).some((output) => candidate(output?.script_id))) {
    attempts.push({
      source: 'previous_step',
      id: null,
      found: false,
      note: 'no completed step in this mission produced a script id',
    });
  }

  // 3. What the operator was actually shown. The approval payload is an audit
  //    record and never the workflow state — but the id inside it points at the
  //    canonical row, and following that pointer is not the same as reading the
  //    snapshot.
  if (input.missionId) {
    const approvals = await store
      .list('approvals', { where: { mission_id: input.missionId } })
      .catch(() => []);
    const scriptApprovals = approvals.filter((entry) => entry.kind === 'script');
    for (const approval of scriptApprovals) {
      const id = candidate((approval.payload as Record<string, unknown>)?.script_id);
      const found = await tryId(
        'approval_payload',
        id,
        'the script approval carries no usable script id',
      );
      if (found) return found;
    }
    if (scriptApprovals.length === 0) {
      // Recorded even though there was nothing to try. A diagnostic that
      // silently omits the sources it found empty leaves the reader unable to
      // tell "checked, nothing there" from "never checked".
      attempts.push({
        source: 'approval_payload',
        id: null,
        found: false,
        note: 'this mission has raised no script approval',
      });
    }
  }

  // 4. Anything this mission wrote. Scripts record the task that produced them,
  //    and tasks record their mission, so the mission owns its scripts whether
  //    or not any reference to them survived.
  if (input.missionId) {
    const tasks = await store
      .list('tasks', { where: { mission_id: input.missionId } })
      .catch(() => []);
    const scripts = tasks.length
      ? await store
          .list('youtube_scripts', { where: { task_id: tasks.map((task) => task.id) } })
          .catch(() => [])
      : [];
    const newest = [...scripts].sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
    if (newest) {
      attempts.push({
        source: 'mission_tasks',
        id: newest.id,
        found: true,
        note: `found by walking the mission's own tasks, version ${newest.version}`,
      });
      return { script: newest, via: 'mission_tasks', restoredFromArchive: false, attempts };
    }
    attempts.push({
      source: 'mission_tasks',
      id: null,
      found: false,
      note: `none of the mission's ${tasks.length} tasks has a script attached`,
    });
  }

  throw new ScriptUnavailable(attempts, input.missionId);
}

/**
 * Rebuilds a script head row from its newest archived version.
 *
 * The versions table is append-only and nothing writes to it except the write
 * and revise steps, so it is the most durable record of the work in the system.
 * Rebuilding is honest about what it does and does not know: the sections and
 * the version number come from the archive, while anything the archive never
 * stored is left at a plainly recognisable default rather than invented.
 */
async function restoreFromArchive(
  store: DataStore,
  scriptId: string,
  input: ResolutionInput,
): Promise<YoutubeScript | null> {
  const versions = await store
    .list('youtube_script_versions', { where: { script_id: scriptId } })
    .catch(() => [] as YoutubeScriptVersion[]);
  if (versions.length === 0) return null;

  const newest = [...versions].sort((a, b) => b.version - a.version)[0]!;
  if (!input.businessId) return null;

  const sections = newest.sections as ScriptSection[];
  const wordCount = sections.reduce(
    (total, section) => total + section.body.trim().split(/\s+/).filter(Boolean).length,
    0,
  );
  const timestamp = new Date().toISOString();

  const rebuilt: YoutubeScript = {
    id: scriptId,
    business_id: input.businessId,
    idea_id: null,
    research_id: null,
    task_id: null,
    title: titleFrom(input) ?? `Recovered script ${scriptId.slice(0, 8)}`,
    sections,
    word_count: wordCount,
    estimated_duration_seconds: Math.round((wordCount / 155) * 60),
    tone: 'documentary',
    audience: '',
    goal: '',
    status: 'draft',
    version: newest.version,
    is_demo: false,
    created_at: newest.created_at,
    updated_at: timestamp,
  };

  // Written back, so the next step finds a row rather than repeating the
  // rebuild. If the insert is refused — the row exists but is invisible to this
  // caller, say — the rebuilt script is still returned so the mission can
  // continue; the failure to persist is not the operator's problem to solve
  // mid-run.
  try {
    await store.insert('youtube_scripts', rebuilt);
  } catch {
    /* Returned unpersisted rather than failing the step. */
  }
  return rebuilt;
}

/** The title the approval recorded, when there is one. */
function titleFrom(input: ResolutionInput): string | null {
  const fromTask = input.taskInput.script_title;
  return typeof fromTask === 'string' && fromTask.trim() ? fromTask.trim() : null;
}

/**
 * Records a rebuilt script and a fresh version for it.
 *
 * Used by the write and revise steps so version history has exactly one writer.
 */
export async function recordScriptVersion(
  store: DataStore,
  scriptId: string,
  version: number,
  sections: ScriptSection[],
  note: string,
): Promise<void> {
  await store.insert('youtube_script_versions', {
    id: uuid(),
    script_id: scriptId,
    version,
    sections,
    note,
    created_at: new Date().toISOString(),
  });
}
