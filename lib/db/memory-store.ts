import type {
  DataStore,
  Filter,
  QueryOptions,
  Row,
  TableName,
} from './tables';
import { TABLE_NAMES } from './tables';
import { assertStorableRow, assertStorableRows } from './validate';

type AnyRow = { id: string; [key: string]: unknown };

function matches<T>(row: AnyRow, where: Filter<T> | undefined): boolean {
  if (!where) return true;
  for (const [key, expected] of Object.entries(where)) {
    if (expected === undefined) continue;
    const actual = row[key];
    if (Array.isArray(expected)) {
      if (!expected.includes(actual as never)) return false;
    } else if (actual !== expected) {
      return false;
    }
  }
  return true;
}

function compare(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return -1;
  if (b === null || b === undefined) return 1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b));
}

/**
 * Process-local store. This is what powers Demo Mode and local development
 * without Supabase credentials. It is intentionally not durable: restarting
 * the server reseeds it.
 */
export class MemoryStore implements DataStore {
  readonly driver = 'memory' as const;
  private tables = new Map<string, Map<string, AnyRow>>();
  private rev = 0;

  constructor() {
    for (const name of TABLE_NAMES) this.tables.set(name, new Map());
  }

  private table(name: TableName): Map<string, AnyRow> {
    let t = this.tables.get(name);
    if (!t) {
      t = new Map();
      this.tables.set(name, t);
    }
    return t;
  }

  async list<T extends TableName>(
    table: T,
    options: QueryOptions<Row<T>> = {},
  ): Promise<Row<T>[]> {
    let rows = [...this.table(table).values()].filter((r) =>
      matches<Row<T>>(r, options.where),
    );
    if (options.orderBy) {
      const { column, ascending = true } = options.orderBy;
      rows = rows.sort((a, b) => {
        const d = compare(a[column], b[column]);
        return ascending ? d : -d;
      });
    }
    if (options.limit !== undefined) rows = rows.slice(0, options.limit);
    // Structured clone so callers cannot mutate stored state by reference.
    return rows.map((r) => structuredClone(r)) as unknown as Row<T>[];
  }

  async get<T extends TableName>(
    table: T,
    id: string,
  ): Promise<Row<T> | null> {
    const row = this.table(table).get(id);
    return row ? (structuredClone(row) as unknown as Row<T>) : null;
  }

  async insert<T extends TableName>(table: T, row: Row<T>): Promise<Row<T>> {
    assertStorableRow(table, row);
    this.table(table).set(
      (row as unknown as AnyRow).id,
      structuredClone(row) as unknown as AnyRow,
    );
    this.rev += 1;
    return row;
  }

  async insertMany<T extends TableName>(
    table: T,
    rows: Row<T>[],
  ): Promise<Row<T>[]> {
    assertStorableRows(table, rows);
    for (const row of rows) {
      this.table(table).set(
        (row as unknown as AnyRow).id,
        structuredClone(row) as unknown as AnyRow,
      );
    }
    this.rev += 1;
    return rows;
  }

  async update<T extends TableName>(
    table: T,
    id: string,
    patch: Partial<Row<T>>,
  ): Promise<Row<T>> {
    assertStorableRow(table, patch);
    const existing = this.table(table).get(id);
    if (!existing) throw new Error(`${table}: no row with id ${id}`);
    const next = { ...existing, ...structuredClone(patch) } as unknown as AnyRow;
    this.table(table).set(id, next);
    this.rev += 1;
    return structuredClone(next) as unknown as Row<T>;
  }

  async remove<T extends TableName>(table: T, id: string): Promise<void> {
    this.table(table).delete(id);
    this.rev += 1;
  }

  async version(): Promise<number> {
    return this.rev;
  }

  /** Test helper — drops all data. */
  reset(): void {
    for (const name of TABLE_NAMES) this.tables.set(name, new Map());
    this.rev = 0;
  }
}
