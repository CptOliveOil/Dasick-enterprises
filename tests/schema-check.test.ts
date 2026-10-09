import { readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkSchema, MIGRATION_PROBES, type ProbeClient } from '@/lib/db/schema-check';

/**
 * A fake PostgREST that knows which columns exist. Probes ask for
 * `select a,b limit 0`, so answering means checking each requested column.
 */
function fakeClient(
  present: Record<string, string[]>,
  failure?: { code?: string; message: string; status?: number } | Error,
): ProbeClient {
  return {
    from(table) {
      return {
        select(columns) {
          return {
            async limit() {
              if (failure instanceof Error) throw failure;
              if (failure) return { error: failure, status: failure.status };
              const have = present[table];
              if (!have) {
                return {
                  error: { code: 'PGRST205', message: `Could not find the table 'public.${table}' in the schema cache` },
                  status: 404,
                };
              }
              const absent = columns.split(',').find((c) => !have.includes(c));
              if (absent) {
                return { error: { code: '42703', message: `column ${table}.${absent} does not exist` }, status: 400 };
              }
              return { error: null, status: 200 };
            },
          };
        },
      };
    },
  };
}

/** Everything every probe asks for. */
function fullSchema(): Record<string, string[]> {
  const schema: Record<string, string[]> = {};
  for (const probe of MIGRATION_PROBES) {
    schema[probe.table] = [...(schema[probe.table] ?? []), ...probe.columns];
  }
  return schema;
}

describe('schema check', () => {
  it('has a probe for every migration file, in order', () => {
    const files = readdirSync(path.join(process.cwd(), 'supabase/migrations'))
      .filter((f) => f.endsWith('.sql'))
      .sort()
      .map((f) => f.replace(/\.sql$/, ''));
    expect(MIGRATION_PROBES.map((p) => p.migration)).toEqual(files);
  });

  it('reports a fully migrated database as current', async () => {
    const report = await checkSchema(fakeClient(fullSchema()));
    expect(report.state).toBe('current');
    expect(report.missing).toEqual([]);
  });

  it('names exactly the migrations a database stuck at 0008 is missing', async () => {
    // The state the vault last recorded as applied.
    const schema = fullSchema();
    schema.media_assets = schema.media_assets!.filter((c) => c !== 'product_id');
    schema.missions = schema.missions!.filter((c) => c !== 'parent_mission_id');
    schema.workflow_runs = schema.workflow_runs!.filter((c) => c !== 'workflow_key');
    schema.tasks = ['id', 'mission_id'];
    const report = await checkSchema(fakeClient(schema));
    expect(report.state).toBe('behind');
    expect(report.missing).toEqual([
      '0009_etsy_production',
      '0010_mission_hierarchy',
      '0011_workflow_run_identity',
      '0012_task_lifecycle',
    ]);
    expect(report.summary).toMatch(/0009_etsy_production/);
  });

  it('treats a missing table as a missing migration', async () => {
    const schema = fullSchema();
    delete schema.pokemon_opportunities;
    const report = await checkSchema(fakeClient(schema));
    expect(report.missing).toEqual(['0005_pokemon']);
  });

  it('says unreachable, not behind, when the project does not answer', async () => {
    const report = await checkSchema(fakeClient({}, new TypeError('fetch failed')));
    expect(report.state).toBe('unreachable');
    expect(report.missing).toEqual([]);
    expect(report.summary).toMatch(/paused/);
  });

  it('says unreachable on an auth or service error rather than guessing a migration', async () => {
    const report = await checkSchema(
      fakeClient({}, { message: 'Invalid API key', status: 401 }),
    );
    expect(report.state).toBe('unreachable');
    expect(report.error).toMatch(/401/);
  });
});
