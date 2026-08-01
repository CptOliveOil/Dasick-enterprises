import { assertStorableRow, assertStorableRows } from './validate';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DataStore, QueryOptions, Row, TableName } from './tables';

/**
 * Postgres-backed driver. Row shapes match `types/domain.ts` one-for-one, so
 * no mapping layer is needed — the migration defines columns with the same
 * names and JSONB for the nested structures.
 */
export class SupabaseStore implements DataStore {
  readonly driver = 'supabase' as const;

  constructor(private client: SupabaseClient) {}

  async list<T extends TableName>(
    table: T,
    options: QueryOptions<Row<T>> = {},
  ): Promise<Row<T>[]> {
    let query = this.client.from(table).select('*');
    for (const [key, value] of Object.entries(options.where ?? {})) {
      if (value === undefined) continue;
      query = Array.isArray(value)
        ? query.in(key, value as never[])
        : query.eq(key, value as never);
    }
    if (options.orderBy) {
      query = query.order(options.orderBy.column, {
        ascending: options.orderBy.ascending ?? true,
      });
    }
    if (options.limit !== undefined) query = query.limit(options.limit);

    const { data, error } = await query;
    if (error) throw new Error(`${table}: ${error.message}`);
    return (data ?? []) as Row<T>[];
  }

  async get<T extends TableName>(
    table: T,
    id: string,
  ): Promise<Row<T> | null> {
    const { data, error } = await this.client
      .from(table)
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(`${table}: ${error.message}`);
    return (data ?? null) as Row<T> | null;
  }

  async insert<T extends TableName>(table: T, row: Row<T>): Promise<Row<T>> {
    assertStorableRow(table, row);
    const { data, error } = await this.client
      .from(table)
      .insert(row as never)
      .select()
      .single();
    if (error) throw new Error(`${table}: ${error.message}`);
    return data as Row<T>;
  }

  async insertMany<T extends TableName>(
    table: T,
    rows: Row<T>[],
  ): Promise<Row<T>[]> {
    assertStorableRows(table, rows);
    if (rows.length === 0) return [];
    const { data, error } = await this.client
      .from(table)
      .insert(rows as never[])
      .select();
    if (error) throw new Error(`${table}: ${error.message}`);
    return (data ?? []) as Row<T>[];
  }

  async update<T extends TableName>(
    table: T,
    id: string,
    patch: Partial<Row<T>>,
  ): Promise<Row<T>> {
    assertStorableRow(table, patch);
    const { data, error } = await this.client
      .from(table)
      .update(patch as never)
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(`${table}: ${error.message}`);
    return data as Row<T>;
  }

  async remove<T extends TableName>(table: T, id: string): Promise<void> {
    const { error } = await this.client.from(table).delete().eq('id', id);
    if (error) throw new Error(`${table}: ${error.message}`);
  }

  async version(): Promise<number> {
    // Postgres has no cheap global revision counter, and Supabase Realtime is
    // the right tool there. Clients fall back to interval polling.
    return Date.now();
  }
}
