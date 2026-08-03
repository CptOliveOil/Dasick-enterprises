---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Per-claim decisions behind the source gate.
migration: `0004`
scope: owner-scoped
related:
  - [[Islamic Source Checker]]
  - [[Approval System]]
tags:
  - table
  - database
---

# source_resolutions

> [!info] Purpose
> Per-claim decisions behind the source gate.

## Key columns

`items[]`, `status`, `approval_id`

## Relationships

Referenced by a `source` approval.

## Indexes

—

## Row Level Security

**owner-scoped** — see [[Row Level Security]].

## Used by

[[Islamic Source Checker]], [[Approval System]]

## Migration history

`0004`

## Related

- [[Islamic Source Checker]]
- [[Approval System]]
