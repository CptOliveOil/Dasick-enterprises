---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Postgres via Supabase, with the same shape in memory for Demo Mode
related:
  - [[Supabase]]
  - [[Row Level Security]]
  - [[05 Database/Index|Tables]]
  - [[Migrations]]
tags:
  - architecture
---

# Database

> [!info] Purpose
> One `DataStore` interface, two drivers. Every table is typed once so a table cannot exist in one driver and not the other.

**Code** — `lib/db/tables.ts`, `lib/db/memory-store.ts`, `lib/db/supabase-store.ts`

## Responsibilities

- Type every table in `Tables`
- Validate ids at the storage boundary
- Enforce the same shape in memory and in Postgres

## Inputs

- Rows

## Outputs

- Rows

## Dependencies

- [[Supabase]]
- [[Row Level Security]]

## Failure modes

- **Blank string where a uuid belongs** → rejected at the boundary. See [[Blank UUID In Research]].
- **Driver drift** → prevented by the shared `Tables` type.

## Future improvements

- Soft deletes with retention
- Read replicas if volume demands

## Related

- [[Supabase]]
- [[Row Level Security]]
- [[05 Database/Index|Tables]]
- [[Migrations]]
