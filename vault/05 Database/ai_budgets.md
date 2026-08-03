---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: The ceilings. One row per account, enforced by a unique constraint.
migration: `0006`
scope: owner-only
related:
  - [[Budget System]]
  - [[Budgets Have No Default]]
  - [[Authority Model]]
tags:
  - table
  - database
---

# ai_budgets

> [!info] Purpose
> The ceilings. One row per account, enforced by a unique constraint.

## Key columns

`owner_id` (**unique**), `currency`, `monthly_ceiling`, `warn_at_percent`, `per_mission_ceiling`, `approval_over`, `activated_at`

## Relationships

One per owner. The unique constraint is what stops a second row becoming a second, higher ceiling.

## Indexes

—

## Row Level Security

**owner-only** — see [[Row Level Security]].

## Used by

[[Budget System]]

## Migration history

`0006`

## Related

- [[Budget System]]
- [[Budgets Have No Default]]
- [[Authority Model]]
