---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: The edges of the task graph.
migration: `0001`
scope: via task
related:
  - [[Task Graph]]
tags:
  - table
  - database
---

# task_dependencies

> [!info] Purpose
> The edges of the task graph.

## Key columns

`task_id`, `depends_on_task_id`

## Relationships

Both columns reference `tasks`.

## Indexes

—

## Row Level Security

**via task** — see [[Row Level Security]].

## Used by

[[Task Graph]]

## Migration history

`0001`

## Related

- [[Task Graph]]
