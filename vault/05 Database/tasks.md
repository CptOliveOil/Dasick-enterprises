---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: One row per workflow step. The unit of retry.
migration: `0001`
scope: owner-scoped
related:
  - [[Task Graph]]
  - [[Retry Engine]]
  - [[Step Key Collision]]
tags:
  - table
  - database
---

# tasks

> [!info] Purpose
> One row per workflow step. The unit of retry.

## Key columns

`mission_id`, `agent_id`, `step_key`, `title`, `status`, `input`, `output`, `error`, `progress`

## Relationships

Child of `missions`; linked by `task_dependencies`.

## Indexes

—

## Row Level Security

**owner-scoped** — see [[Row Level Security]].

## Used by

[[Task Graph]], [[Retry Engine]], [[Agent Engine]]

## Migration history

`0001`

## Related

- [[Task Graph]]
- [[Retry Engine]]
- [[Step Key Collision]]
