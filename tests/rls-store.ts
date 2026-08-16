import { MemoryStore } from '@/lib/db/memory-store';
import type { DataStore, QueryOptions, Row, TableName } from '@/lib/db/tables';

/**
 * An in-memory store that enforces the Row Level Security policies the
 * migrations actually create.
 *
 * The reason this exists: `MemoryStore` accepts everything, so a write that
 * Postgres would refuse passes silently in tests and fails the first time a
 * real operator clicks the button. That is exactly how workspace provisioning
 * shipped with an insert into `workflow_definitions` — a table whose shared,
 * ownerless rows migration 0003 deliberately makes read-only.
 *
 * The rules below are transcribed from the migrations, not invented here:
 *
 * - `supabase/migrations/0001_initial_schema.sql` — the `owner access` loop over
 *   tables carrying `owner_id`, the `owner access via business` loop, and the
 *   per-parent policies for agent_memory, task_dependencies and workflow_runs.
 * - `supabase/migrations/0002_production_pipeline.sql` — media, provider jobs,
 *   production budgets and settings.
 * - `supabase/migrations/0003_accounts_agents_islamic.sql` — source policies,
 *   visual rules, the Islamic tables, and the workflow-library rules that make
 *   `owner_id is null` rows immutable.
 * - `0004`–`0007` — source resolutions, Pokémon opportunities, AI budgets and
 *   mission outcomes.
 * - `0011_workflow_run_identity.sql` — `workflow_runs.workflow_definition_id`
 *   is nullable and no longer `references workflow_definitions(id)` by itself;
 *   the check below still enforces it as a foreign key *when set*, because a
 *   non-null value that names a row that does not exist is exactly the bug
 *   this migration exists to make impossible again — see the vault bug page
 *   "Workflow Runs Referenced A Workflow That Was Never A Database Row".
 *
 * When a migration changes a policy, change it here too. A test double that has
 * drifted from the schema is worse than none, because it is trusted.
 */

/** Tables whose policy is `auth.uid() = owner_id`, for all operations. */
const OWNER_SCOPED: ReadonlySet<string> = new Set([
  'businesses',
  'agents',
  'missions',
  'tasks',
  'approvals',
  'activity_logs',
  'notifications',
  'command_messages',
  'financial_transactions',
  'api_usage',
  'integration_connections',
  'media_assets',
  'provider_jobs',
  'production_budgets',
  'production_settings',
  'source_policies',
  'visual_rules',
  'source_resolutions',
  'pokemon_opportunities',
  'ai_budgets',
  'mission_outcomes',
]);

/** Tables reached through their business: the business must be the caller's. */
const BUSINESS_SCOPED: ReadonlySet<string> = new Set([
  'youtube_channels',
  'youtube_ideas',
  'youtube_research',
  'youtube_scripts',
  'youtube_fact_checks',
  'youtube_videos',
  'youtube_thumbnail_concepts',
  'youtube_analytics',
  'youtube_channel_intelligence',
  'etsy_stores',
  'etsy_opportunities',
  'etsy_products',
  'etsy_listings',
  'etsy_keywords',
  'etsy_analytics',
  'youtube_voiceovers',
  'youtube_timelines',
  'youtube_render_jobs',
  'youtube_quality_checks',
  'youtube_metadata',
  'islamic_research',
  'islamic_source_checks',
  'youtube_captions',
  'youtube_copyright_reviews',
]);

/** The message Postgres actually produces, so tests assert on the real thing. */
function refusal(table: string): Error {
  return new Error(
    `new row violates row-level security policy for table "${table}"`,
  );
}

/**
 * Wraps a MemoryStore with the policies above.
 *
 * Reads are left permissive on purpose. The bug class this guards against is
 * writing rows the database will refuse; a test that also had to satisfy every
 * select policy would be testing the double rather than the application.
 */
export class RlsMemoryStore implements DataStore {
  readonly driver = 'supabase' as const;
  private readonly inner = new MemoryStore();

  constructor(private readonly sessionUserId: string) {}

  private async check<T extends TableName>(table: T, row: Row<T>): Promise<void> {
    const record = row as unknown as Record<string, unknown>;

    if (table === 'profiles') {
      if (record.id !== this.sessionUserId) throw refusal(table);
      return;
    }

    // The shared workflow library. Insert is permitted only for a row the
    // caller owns; an ownerless row belongs to the built-in library and no
    // session may create one.
    if (table === 'workflow_definitions') {
      if (record.owner_id == null || record.owner_id !== this.sessionUserId) {
        throw refusal(table);
      }
      return;
    }

    if (OWNER_SCOPED.has(table)) {
      if (record.owner_id !== this.sessionUserId) throw refusal(table);
      return;
    }

    if (BUSINESS_SCOPED.has(table)) {
      const businessId = record.business_id;
      if (typeof businessId !== 'string') throw refusal(table);
      const business = await this.inner.get('businesses', businessId);
      if (!business || business.owner_id !== this.sessionUserId) throw refusal(table);
      return;
    }

    if (table === 'agent_memory') {
      const agentId = record.agent_id;
      if (typeof agentId !== 'string') throw refusal(table);
      const agent = await this.inner.get('agents', agentId);
      if (!agent || agent.owner_id !== this.sessionUserId) throw refusal(table);
      return;
    }

    if (table === 'task_dependencies') {
      const taskId = record.task_id;
      if (typeof taskId !== 'string') throw refusal(table);
      const task = await this.inner.get('tasks', taskId);
      if (!task || task.owner_id !== this.sessionUserId) throw refusal(table);
      return;
    }

    if (table === 'workflow_runs') {
      const missionId = record.mission_id;
      if (typeof missionId !== 'string') throw refusal(table);
      const mission = await this.inner.get('missions', missionId);
      if (!mission || mission.owner_id !== this.sessionUserId) throw refusal(table);

      // Not an RLS rule — a foreign key. `workflow_definition_id` is nullable
      // (migration 0011), but when it is set it must name a row that
      // genuinely exists, exactly like Postgres enforces. This is what
      // catches a built-in workflow's code-only id being written as if it
      // were a database row.
      const definitionId = record.workflow_definition_id;
      if (definitionId != null) {
        if (typeof definitionId !== 'string') throw refusal(table);
        const definition = await this.inner.get('workflow_definitions', definitionId);
        if (!definition) {
          throw new Error(
            'workflow_runs: insert or update on table "workflow_runs" violates foreign key ' +
              'constraint "workflow_runs_workflow_definition_id_fkey"',
          );
        }
      }
      return;
    }

    // Anything not listed is a table the transcription has not covered.
    // Failing loudly is right: a silent pass here is how the double drifts.
    throw new Error(
      `RlsMemoryStore has no policy transcribed for "${table}". ` +
        'Add it, matching the migration that created it.',
    );
  }

  async list<T extends TableName>(table: T, options?: QueryOptions<Row<T>>) {
    return this.inner.list(table, options);
  }

  async get<T extends TableName>(table: T, id: string) {
    return this.inner.get(table, id);
  }

  async insert<T extends TableName>(table: T, row: Row<T>) {
    await this.check(table, row);
    return this.inner.insert(table, row);
  }

  async insertMany<T extends TableName>(table: T, rows: Row<T>[]) {
    for (const row of rows) await this.check(table, row);
    return this.inner.insertMany(table, rows);
  }

  async update<T extends TableName>(table: T, id: string, patch: Partial<Row<T>>) {
    const existing = await this.inner.get(table, id);
    if (!existing) throw new Error(`No ${table} with id ${id}`);
    await this.check(table, { ...existing, ...patch } as Row<T>);
    return this.inner.update(table, id, patch);
  }

  async remove<T extends TableName>(table: T, id: string) {
    const existing = await this.inner.get(table, id);
    if (existing) await this.check(table, existing);
    return this.inner.remove(table, id);
  }

  async version() {
    return this.inner.version();
  }
}
