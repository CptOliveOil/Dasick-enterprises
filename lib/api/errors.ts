import { NextResponse } from 'next/server';
import { InvalidStoredValue, MissingRelationship } from '@/lib/db/validate';

/**
 * Turns a data-integrity failure into an answer the caller can act on.
 *
 * These are not server faults and should not be reported as 500s. A missing
 * relationship or a malformed id means the request cannot be carried out as
 * asked — the caller needs the name of the thing that is missing, not a stack
 * trace and not `invalid input syntax for type uuid: ""`.
 *
 * Returns null for anything else, so a route can use it as a filter and let
 * genuine faults fall through to its own handling.
 */
export function dataErrorResponse(error: unknown): NextResponse | null {
  if (error instanceof MissingRelationship) {
    return NextResponse.json(
      {
        error: error.message,
        kind: 'missing_relationship',
      },
      { status: 422 },
    );
  }

  if (error instanceof InvalidStoredValue) {
    return NextResponse.json(
      {
        error: error.message,
        kind: 'invalid_value',
        table: error.table,
        column: error.column,
      },
      { status: 422 },
    );
  }

  return null;
}
