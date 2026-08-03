---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: The unit of work an operator asks for.
migration: `0001`, priority and deadlines in `0004`
scope: owner-scoped
related:
  - [[Mission Engine]]
  - [[mission_outcomes]]
tags:
  - table
  - database
---

# missions

> [!info] Purpose
> The unit of work an operator asks for.

## Key columns

`owner_id`, `business_id`, `number`, `title`, `objective`, `status`, `priority`, `target_date`, `context`, `progress`, `completed_at`

## Relationships

Parent of `tasks`, `approvals`, `workflow_runs`, `mission_outcomes`.

## Indexes

—

## Row Level Security

**owner-scoped** — see [[Row Level Security]].

## Used by

[[Mission Engine]], [[Business Memory]]

## Migration history

`0001`, priority and deadlines in `0004`

## Related

- [[Mission Engine]]
- [[mission_outcomes]]
