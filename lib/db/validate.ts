import type { TableName } from './tables';

/**
 * Catches malformed rows before they reach Postgres.
 *
 * The failure this exists to prevent looked like this in production:
 *
 *   youtube_research: invalid input syntax for type uuid: ""
 *
 * A handler could not find an optional relationship, wrote `''` to satisfy a
 * TypeScript field typed as a non-nullable id, and Postgres — correctly —
 * refused it. The operator got a database error naming a type, which tells them
 * nothing about what went wrong or what to do.
 *
 * Two things are wrong with that, and both are fixed here. The message should
 * name the relationship rather than the type, and it should arrive from the
 * application rather than the driver, so it is the same in tests (which run on
 * the in-memory store) as in production. Both stores call `assertStorableRow`
 * on every write, so an empty id is impossible to persist by either route.
 *
 * This validates *shape*, not existence. Whether the referenced row is really
 * there is the database's job, and it does it with a foreign key.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Columns that end in `id` but are genuinely text in the schema — an id issued
 * by somebody else's system, not one of ours. Taken from the migrations; add to
 * it when a migration adds another.
 */
const TEXT_ID_COLUMNS: ReadonlySet<string> = new Set([
  'external_id',
  'provider_asset_id',
  'published_external_id',
  'voice_id',
]);

/** True when this column holds one of our uuids. */
function isUuidColumn(key: string): boolean {
  if (TEXT_ID_COLUMNS.has(key)) return false;
  return key === 'id' || key.endsWith('_id');
}

/**
 * A relationship a row needs and does not have.
 *
 * Its own class so routes can answer with a useful status and a JSON body
 * rather than letting it surface as an unhandled 500.
 */
export class MissingRelationship extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MissingRelationship';
  }
}

/** A value that cannot be stored, with the column named. */
export class InvalidStoredValue extends Error {
  constructor(
    readonly table: string,
    readonly column: string,
    message: string,
  ) {
    super(message);
    this.name = 'InvalidStoredValue';
  }
}

/**
 * Checks every id-shaped field on a row.
 *
 * `null` and `undefined` pass: an optional relationship that is genuinely
 * absent is the correct state, and the column is nullable. What never passes is
 * an empty string or whitespace, which is neither a uuid nor an absence — it is
 * a missing value dressed up as a present one, and it is the exact bug this
 * module was written for.
 */
export function assertStorableRow(table: TableName, row: unknown): void {
  if (!row || typeof row !== 'object') return;

  for (const [key, value] of Object.entries(row as Record<string, unknown>)) {
    if (!isUuidColumn(key) || value === null || value === undefined) continue;

    if (typeof value !== 'string') {
      throw new InvalidStoredValue(
        table,
        key,
        `${table}.${key} must be a UUID or null, but received a ${typeof value}.`,
      );
    }

    if (value.trim() === '') {
      throw new InvalidStoredValue(
        table,
        key,
        `${table}.${key} was set to an empty string. A relationship that is genuinely ` +
          'absent must be null; an empty string is a missing value pretending to be a ' +
          'present one, and the database will reject it.',
      );
    }

    if (!UUID.test(value)) {
      throw new InvalidStoredValue(
        table,
        key,
        `${table}.${key} is not a valid UUID: "${value.slice(0, 60)}".`,
      );
    }
  }
}

export function assertStorableRows(table: TableName, rows: unknown[]): void {
  for (const row of rows) assertStorableRow(table, row);
}

/**
 * A required relationship, or an error that says which one and why.
 *
 * Used where the column is `not null` in the schema — `business_id` on every
 * content table. Falling back to an empty string there was never a fix; it
 * turned "this task is not attached to a business" into a type error thrown by
 * the database three layers away from the cause.
 */
export function requireId(
  value: string | null | undefined,
  what: string,
  remedy: string,
): string {
  if (typeof value === 'string' && value.trim() !== '' && UUID.test(value)) return value;
  throw new MissingRelationship(`${what} ${remedy}`);
}

/** Normalises an optional id: a real uuid, or null. Never an empty string. */
export function optionalId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed !== '' && UUID.test(trimmed) ? trimmed : null;
}

export { UUID as UUID_PATTERN };
