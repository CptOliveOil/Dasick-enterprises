/**
 * Which migrations the connected database actually carries.
 *
 * The code writes columns from every migration on ordinary paths — a YouTube
 * mission alone writes `missions.parent_mission_id` (0010),
 * `workflow_runs.workflow_key` (0011) and `tasks.claimed_at` (0012). A database
 * that is behind does not fail at startup; it fails on the first insert, as a
 * PostgREST message about a column "in the schema cache", several layers away
 * from the cause. This answers the question up front, by name.
 *
 * Every probe is `select <columns> limit 0`: read-only, returns no rows, costs
 * nothing, and is answered the same way with or without Row Level Security.
 */

export interface MigrationProbe {
  migration: string;
  table: string;
  columns: string[];
}

/**
 * One signature per migration — a table it creates or a column it adds, chosen
 * so its presence means that file ran. Keep in step with `supabase/migrations`;
 * `tests/schema-check.test.ts` fails when a migration file has no probe.
 */
export const MIGRATION_PROBES: MigrationProbe[] = [
  { migration: '0001_initial_schema', table: 'tasks', columns: ['id', 'mission_id'] },
  { migration: '0002_production_pipeline', table: 'youtube_render_jobs', columns: ['id'] },
  { migration: '0003_accounts_agents_islamic', table: 'agents', columns: ['archived_at'] },
  { migration: '0004_operations', table: 'missions', columns: ['priority', 'target_date'] },
  { migration: '0005_pokemon', table: 'pokemon_opportunities', columns: ['id'] },
  { migration: '0006_real_mode', table: 'ai_budgets', columns: ['id'] },
  { migration: '0007_business_memory', table: 'mission_outcomes', columns: ['id'] },
  { migration: '0008_studio', table: 'youtube_copyright_reviews', columns: ['id'] },
  { migration: '0009_etsy_production', table: 'media_assets', columns: ['product_id'] },
  { migration: '0010_mission_hierarchy', table: 'missions', columns: ['parent_mission_id'] },
  { migration: '0011_workflow_run_identity', table: 'workflow_runs', columns: ['workflow_key'] },
  {
    migration: '0012_task_lifecycle',
    table: 'tasks',
    columns: ['claimed_at', 'heartbeat_at', 'reclaim_count'],
  },
];

export type SchemaState = 'current' | 'behind' | 'unreachable';

export interface SchemaReport {
  state: SchemaState;
  /** The newest migration this code expects. */
  expected: string;
  /** Migrations whose signature is missing, oldest first. */
  missing: string[];
  /** Set when the database could not be asked at all (paused, offline, bad key). */
  error: string | null;
  /** One sentence for the operator. */
  summary: string;
}

/** The minimum of a Supabase client this needs — kept narrow so tests can fake it. */
export interface ProbeClient {
  from(table: string): {
    select(columns: string): {
      limit(count: number): PromiseLike<{
        error: { code?: string; message: string } | null;
        status?: number;
      }>;
    };
  };
}

/**
 * Postgres and PostgREST codes that mean "this table or column is not there".
 * Anything else — a network failure, a paused project, a 401 — means the
 * database could not be asked, which is a different answer.
 */
const MISSING_CODES = new Set(['42703', '42P01', 'PGRST204', 'PGRST205']);

function isMissing(error: { code?: string; message: string }): boolean {
  if (error.code && MISSING_CODES.has(error.code)) return true;
  return /does not exist|could not find .* in the schema cache/i.test(error.message);
}

export async function checkSchema(client: ProbeClient): Promise<SchemaReport> {
  const expected = MIGRATION_PROBES[MIGRATION_PROBES.length - 1]!.migration;
  const missing: string[] = [];

  for (const probe of MIGRATION_PROBES) {
    let result: { error: { code?: string; message: string } | null; status?: number };
    try {
      result = await client.from(probe.table).select(probe.columns.join(',')).limit(0);
    } catch (error) {
      return unreachable(expected, error instanceof Error ? error.message : String(error));
    }
    if (!result.error) continue;
    if (isMissing(result.error)) {
      missing.push(probe.migration);
      continue;
    }
    return unreachable(
      expected,
      `${result.status ? `HTTP ${result.status}: ` : ''}${result.error.message}`,
    );
  }

  if (missing.length === 0) {
    return {
      state: 'current',
      expected,
      missing,
      error: null,
      summary: `The database carries every migration through ${expected}.`,
    };
  }
  return {
    state: 'behind',
    expected,
    missing,
    error: null,
    summary:
      `The database is missing ${missing.length} migration${missing.length === 1 ? '' : 's'}: ` +
      `${missing.join(', ')}. Apply ${missing.length === 1 ? 'it' : 'them'} in order from ` +
      'supabase/migrations before running missions — inserts will fail until then.',
  };
}

function unreachable(expected: string, message: string): SchemaReport {
  return {
    state: 'unreachable',
    expected,
    missing: [],
    error: message,
    summary:
      'The database could not be asked about its schema. If the Supabase project is paused, ' +
      `resume it in the Supabase dashboard. (${message})`,
  };
}
