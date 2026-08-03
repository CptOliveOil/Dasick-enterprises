---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: The workforce. A capability list, an authority level and a planet.
migration: `0001`, extended in `0003`
scope: owner-scoped
related:
  - [[03 Agents/Index|Agents]]
  - [[Authority Model]]
  - [[Galaxy]]
tags:
  - table
  - database
---

# agents

> [!info] Purpose
> The workforce. A capability list, an authority level and a planet.

## Key columns

`owner_id`, `business_id`, `name`, `slug`, `role`, `capabilities[]`, `authority_level`, `memory_access`, `visual`

## Relationships

Referenced by `tasks.agent_id` and `agent_memory.agent_id`.

## Indexes

—

## Row Level Security

**owner-scoped** — see [[Row Level Security]].

## Used by

[[Agent Engine]], [[Galaxy]]

## Migration history

`0001`, extended in `0003`

## Related

- [[03 Agents/Index|Agents]]
- [[Authority Model]]
- [[Galaxy]]
