---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Which task fulfilled which step, per mission — identifies its workflow without needing a fake row for a built-in
migration: '0001, extended by 0011'
scope: owner-scoped (via mission)
related:
  - [[Mission Engine]]
  - [[Workflow Engine]]
  - [[Step Key Collision]]
  - [[Workflow Runs Referenced A Workflow That Was Never A Database Row]]
tags:
  - table
  - database
---

# workflow_runs

> [!info] Purpose
> Which task fulfilled which step, per mission.

## Key columns

`mission_id`, `workflow_definition_id`, `workflow_key` (added `0011`), `status`, `step_tasks`

**`workflow_definition_id`** is nullable since `0011`, and set only for a
genuinely custom, database-defined workflow (a real `workflow_definitions`
row, still enforced as a foreign key when present). **`workflow_key`**
carries the workflow's `key` regardless of whether it is built-in or custom,
and is how a built-in identifies itself — built-in workflows are code
(`WORKFLOW_DEFINITIONS`, `lib/workflows/definitions.ts`), never a database
row, so writing their code-only id here as if it were one is exactly the bug
`0011` exists to prevent. See
[[Workflow Runs Referenced A Workflow That Was Never A Database Row]].

A run written before `0011` has `workflow_key: null` and a
`workflow_definition_id` that, for a built-in, was always that deterministic
code-only id. `resolveRunWorkflow()` (`lib/workflows/engine.ts`) resolves
those old rows by matching the id against `WORKFLOW_DEFINITIONS` — no
backfill was needed or done.

## Relationships

Child of `missions`. `workflow_definition_id`, when set, is a genuine foreign
key to `workflow_definitions` — never true for a built-in.

## Indexes

`workflow_runs_workflow_key_idx` on `workflow_key`, added `0011`.

## Row Level Security

**Owner-scoped via its mission** — `workflow_runs` carries no `owner_id`
column of its own; the policy checks that `mission_id` names a mission the
caller owns. See [[Row Level Security]].

## Used by

[[Mission Engine]], [[Workflow Engine]]

## Migration history

`0001` — table created, `workflow_definition_id not null references
workflow_definitions(id)`. `0011` — `workflow_definition_id` made nullable,
`workflow_key` added, the not-null constraint replaced with "at least one of
the two is set".

## Related

- [[Mission Engine]]
- [[Workflow Engine]]
- [[Step Key Collision]]
- [[Workflow Runs Referenced A Workflow That Was Never A Database Row]]
