---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Append-only draft archive. The most durable record in the system.
migration: `0001`
scope: business-scoped
related:
  - [[youtube_scripts]]
  - [[Script Not Found In AI Planned Missions]]
tags:
  - table
  - database
---

# youtube_script_versions

> [!info] Purpose
> Append-only draft archive. The most durable record in the system.

## Key columns

`script_id`, `version`, `sections[]`, `note`

## Relationships

Child of `youtube_scripts`, but survives it — a lost head row is rebuilt from here.

## Indexes

—

## Row Level Security

**business-scoped** — see [[Row Level Security]].

## Used by

[[Scriptwriter]], [[Approval Dossier]]

## Migration history

`0001`

## Related

- [[youtube_scripts]]
- [[Script Not Found In AI Planned Missions]]
