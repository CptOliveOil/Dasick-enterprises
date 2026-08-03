---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Asynchronous provider work.
migration: `0002`
scope: owner-scoped
related:
  - [[Job Queue]]
tags:
  - table
  - database
---

# provider_jobs

> [!info] Purpose
> Asynchronous provider work.

## Key columns

`provider`, `kind`, `status`, `progress`, `external_id`

## Relationships

—

## Indexes

—

## Row Level Security

**owner-scoped** — see [[Row Level Security]].

## Used by

[[Job Queue]]

## Migration history

`0002`

## Related

- [[Job Queue]]
