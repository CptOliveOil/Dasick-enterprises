---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Owner isolation enforced by Postgres, not by the application
related:
  - [[Supabase]]
  - [[Database]]
  - [[Security]]
  - [[RLS Blocks Workspace Provisioning]]
tags:
  - core
  - architecture
---

# Row Level Security

> [!info] Purpose
> Policies use the same expression for `using` and `with check`, so a row the database lets you write is a row it lets you read. Asymmetry is how "written but invisible" happens.

**Code** — `supabase/migrations/0001_initial_schema.sql`, `tests/rls-store.ts`

## Responsibilities

- Owner-scoped tables check `auth.uid() = owner_id`
- Business-scoped tables check ownership through `businesses`
- The shared workflow library is deliberately read-only

## Inputs

- The session user

## Outputs

- Visible rows

## Dependencies

- [[Supabase]]
- [[Database]]

## Failure modes

- **Inserting a shared row** → refused. See [[RLS Blocks Workspace Provisioning]].
- **Null `business_id`** → fails both insert and select, by design.

## Future improvements

- Team roles once more than one person uses a workspace

## Related

- [[Supabase]]
- [[Database]]
- [[Security]]
- [[RLS Blocks Workspace Provisioning]]
