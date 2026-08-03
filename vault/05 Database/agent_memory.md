---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Durable rules an operator approved.
migration: `0001`, provenance in `0004`
scope: via agent
related:
  - [[Agent Memory]]
  - [[Business Memory]]
tags:
  - table
  - database
---

# agent_memory

> [!info] Purpose
> Durable rules an operator approved.

## Key columns

`agent_id`, `type`, `content`, `importance`, `status`, `origin`, `last_used_at`

## Relationships

Child of `agents`; policy resolves through the agent.

## Indexes

—

## Row Level Security

**via agent** — see [[Row Level Security]].

## Used by

[[Agent Memory]], [[Agent Engine]]

## Migration history

`0001`, provenance in `0004`

## Related

- [[Agent Memory]]
- [[Business Memory]]
