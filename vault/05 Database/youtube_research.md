---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: The factual package a script is written from.
migration: `0001`
scope: business-scoped
related:
  - [[Researcher]]
  - [[Blank UUID In Research]]
tags:
  - table
  - database
---

# youtube_research

> [!info] Purpose
> The factual package a script is written from.

## Key columns

`overview`, `facts[]`, `statistics[]`, `timeline[]`, `hooks[]`, `risks[]`, `uncertain_claims[]`

## Relationships

`idea_id` is nullable — see [[Blank UUID In Research]].

## Indexes

—

## Row Level Security

**business-scoped** — see [[Row Level Security]].

## Used by

[[Researcher]], [[Scriptwriter]], [[Approval Dossier]]

## Migration history

`0001`

## Related

- [[Researcher]]
- [[Blank UUID In Research]]
