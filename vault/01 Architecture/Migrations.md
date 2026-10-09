---
status: stable
created: 2026-08-03
updated: 2026-10-09
owner: fayaz
summary: Ordered, additive, never rewritten
related:
  - [[Database]]
  - [[Row Level Security]]
  - [[05 Database/Index|Tables]]
tags:
  - architecture
---

# Migrations

> [!info] Purpose
> Applied migrations are history. A change means a new numbered file.

**Code** — `supabase/migrations/*`

## Responsibilities

- One numbered SQL file per change
- Additive and idempotent where possible

## Inputs

- Schema changes

## Outputs

- Applied tables, indexes and policies

## Dependencies

- [[Supabase]]
- [[Database]]

## Failure modes

- **Editing an applied migration** → forbidden; the database and the file would disagree forever.

## History

| File | Adds |
| --- | --- |
| `0001_initial_schema.sql` | Core tables, RLS policy loops |
| `0002_production_pipeline.sql` | Media, voiceovers, timelines, render jobs, QC, metadata |
| `0003_accounts_agents_islamic.sql` | Roles, agent fields, Islamic tables, workflow library rules |
| `0004_operations.sql` | Mission priority and deadlines, memory provenance, source resolutions |
| `0005_pokemon.sql` | `pokemon_opportunities` |
| `0006_real_mode.sql` | `ai_budgets`, `api_usage` indexes |
| `0007_business_memory.sql` | `mission_outcomes` |
| `0008_studio.sql` | `youtube_captions`, `youtube_copyright_reviews` |
| `0009_etsy_production.sql` | `media_assets.product_id` (+ `archive` type), `etsy_products` design/artwork/mockup/package columns |
| `0010_mission_hierarchy.sql` | `missions.parent_mission_id` — parent/child missions for Operational Readiness |
| `0011_workflow_run_identity.sql` | `workflow_runs.workflow_key`; `workflow_definition_id` made nullable, kept only for a genuine custom workflow |
| `0012_task_lifecycle.sql` | `tasks.claimed_at`, `tasks.heartbeat_at`, `tasks.reclaim_count` — stale-`running`-task recovery. Adds columns only; safe against 0001–0011. |

## Drift detection

`lib/db/schema-check.ts` holds one read-only probe per migration
(`select <signature columns> limit 0`) and reports `current`, `behind` (with
each missing file named) or `unreachable` (paused, offline, bad key). Shown on
**Settings → Status**. `tests/schema-check.test.ts` fails if a migration file
is added without a probe — add one in the same commit.

> [!warning] 0009–0012 are not optional for YouTube
> Despite their names, every YouTube mission writes
> `missions.parent_mission_id` (0010), `workflow_runs.workflow_key` (0011) and
> `tasks.claimed_at`/`heartbeat_at`/`reclaim_count` (0012), and every media
> asset writes `media_assets.product_id` (0009). A database at 0008 — the last
> state the vault recorded as applied — fails on the first task insert.

## Applied state

Unknown as of 2026-10-09: the last record is "0001 → 0008" (Home, Production
Checklist), written before 0009–0012 existed. Check Settings → Status against
the live project rather than trusting this line.

## Related

- [[Database]]
- [[Row Level Security]]
- [[05 Database/Index|Tables]]
