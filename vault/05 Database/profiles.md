---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: One row per account. The first on a fresh project becomes the owner.
migration: `0001`, roles in `0003`
scope: owner-only
related:
  - [[Authentication]]
  - [[Security]]
tags:
  - table
  - database
---

# profiles

> [!info] Purpose
> One row per account. The first on a fresh project becomes the owner.

## Key columns

`id` (= auth user), `email`, `display_name`, `role`, `timezone`, `currency`

## Relationships

The root of ownership. Everything else hangs off `auth.uid()`.

## Indexes

—

## Row Level Security

**owner-only** — see [[Row Level Security]].

## Used by

[[Authentication]]

## Migration history

`0001`, roles in `0003`

## Related

- [[Authentication]]
- [[Security]]
