---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Every model call, with what it cost.
migration: `0001`, month index in `0006`
scope: owner-scoped
related:
  - [[Budget System]]
  - [[Studio Review]]
tags:
  - table
  - database
---

# api_usage

> [!info] Purpose
> Every model call, with what it cost.

## Key columns

`task_id`, `provider`, `model`, `input_tokens`, `output_tokens`, `estimated_cost`, `duration_ms`

## Relationships

Child of a task.

## Indexes

month-to-date index — read on every model call

## Row Level Security

**owner-scoped** — see [[Row Level Security]].

## Used by

[[Budget System]], [[Studio Review]], [[Business Memory]]

## Migration history

`0001`, month index in `0006`

## Related

- [[Budget System]]
- [[Studio Review]]
