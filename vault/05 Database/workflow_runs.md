---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Which task fulfilled which step, per mission.
migration: `0001`
scope: owner-scoped
related:
  - [[Mission Engine]]
  - [[Step Key Collision]]
tags:
  - table
  - database
---

# workflow_runs

> [!info] Purpose
> Which task fulfilled which step, per mission.

## Key columns

`mission_id`, `workflow_definition_id`, `status`, `step_tasks`

## Relationships

Child of `missions`.

## Indexes

—

## Row Level Security

**owner-scoped** — see [[Row Level Security]].

## Used by

[[Mission Engine]]

## Migration history

`0001`

## Related

- [[Mission Engine]]
- [[Step Key Collision]]
