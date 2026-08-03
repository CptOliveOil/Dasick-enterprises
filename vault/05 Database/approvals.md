---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Every gate where a person decides.
migration: `0001`
scope: owner-scoped
related:
  - [[Approval System]]
  - [[Approval Dossier]]
  - [[Every Approval Must Show The Work]]
tags:
  - table
  - database
---

# approvals

> [!info] Purpose
> Every gate where a person decides.

## Key columns

`kind`, `title`, `summary`, `payload`, `status`, `feedback`, `resolved_at`

## Relationships

Optionally linked to a mission, task and agent.

## Indexes

—

## Row Level Security

**owner-scoped** — see [[Row Level Security]].

## Used by

[[Approval System]], [[Approval Dossier]]

## Migration history

`0001`

## Related

- [[Approval System]]
- [[Approval Dossier]]
- [[Every Approval Must Show The Work]]
