---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Claim-by-claim verdicts.
migration: `0001`
scope: business-scoped
related:
  - [[Fact Checker]]
  - [[Approval Dossier]]
tags:
  - table
  - database
---

# youtube_fact_checks

> [!info] Purpose
> Claim-by-claim verdicts.

## Key columns

`script_id`, `findings[]`, `passed`, `summary`

## Relationships

Child of a script.

## Indexes

—

## Row Level Security

**business-scoped** — see [[Row Level Security]].

## Used by

[[Fact Checker]], [[Approval Dossier]]

## Migration history

`0001`

## Related

- [[Fact Checker]]
- [[Approval Dossier]]
