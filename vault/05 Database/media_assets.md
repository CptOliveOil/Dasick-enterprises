---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Every file the system holds.
migration: `0002`
scope: owner-scoped
related:
  - [[Media Pipeline]]
  - [[Copyright Review]]
  - [[Storage]]
tags:
  - table
  - database
---

# media_assets

> [!info] Purpose
> Every file the system holds.

## Key columns

`type`, `provider`, `storage_path`, `public_url`, `mime_type`, `duration`, `width`, `height`, `file_size`, `generation_prompt`, `generation_cost`, `status`, `metadata`

## Relationships

Referenced by scenes, videos, voiceovers and timelines.

## Indexes

—

## Row Level Security

**owner-scoped** — see [[Row Level Security]].

## Used by

[[Media Pipeline]], [[Copyright Review]], [[Rendering Pipeline]]

## Migration history

`0002`

## Related

- [[Media Pipeline]]
- [[Copyright Review]]
- [[Storage]]
