---
status: stable
created: 2026-08-03
updated: 2026-08-16
owner: fayaz
summary: One row per workflow step. The unit of retry.
migration: `0001`
scope: owner-scoped
related:
  - [[Task Graph]]
  - [[Retry Engine]]
  - [[Step Key Collision]]
  - [[A Missing Agent Left A Readiness Task Queued Forever]]
tags:
  - table
  - database
---

# tasks

> [!info] Purpose
> One row per workflow step. The unit of retry.

## Key columns

`mission_id`, `agent_id`, `step_key`, `title`, `status`, `input`, `output`, `error`, `progress`,
`started_at`, `completed_at`, `due_at`, `claimed_at`, `heartbeat_at`, `reclaim_count`

`claimed_at`, `heartbeat_at` and `reclaim_count` (added `0012`) exist for one
reason: there is no background worker, so a `running` task can only leave
that status because the same request that put it there finishes normally. If
that process dies first, these three columns are what lets
`reclaimStaleTasks()` tell an orphaned task apart from one still genuinely
working — see [[Task Graph]].

## Relationships

Child of `missions`; linked by `task_dependencies`.

## Indexes

`tasks_stale_idx` — partial, on `heartbeat_at` where `status = 'running'` (`0012`).

## Row Level Security

**owner-scoped** — see [[Row Level Security]].

## Used by

[[Task Graph]], [[Retry Engine]], [[Agent Engine]]

## Migration history

`0001` · `0012` (`claimed_at`, `heartbeat_at`, `reclaim_count`, `tasks_stale_idx`)

## Related

- [[Task Graph]]
- [[Retry Engine]]
- [[Step Key Collision]]
- [[A Missing Agent Left A Readiness Task Queued Forever]]
