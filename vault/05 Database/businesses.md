---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: A business scopes agents, memory, records and RLS.
migration: `0001`
scope: owner-scoped
related:
  - [[02 Businesses/Index|Businesses]]
  - [[Row Level Security]]
tags:
  - table
  - database
---

# businesses

> [!info] Purpose
> A business scopes agents, memory, records and RLS.

## Key columns

`owner_id`, `name`, `slug`, `kind`, `description`, `colour`, `currency`

## Relationships

Parent of every content table. Business-scoped RLS resolves through it.

## Indexes

—

## Row Level Security

**owner-scoped** — see [[Row Level Security]].

## Used by

[[Mission Engine]], every content table

## Migration history

`0001`

## Related

- [[02 Businesses/Index|Businesses]]
- [[Row Level Security]]
