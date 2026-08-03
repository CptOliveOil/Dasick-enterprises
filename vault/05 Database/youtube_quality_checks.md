---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: The last automated gate.
migration: `0002`
scope: business-scoped
related:
  - [[Quality Control]]
  - [[Studio Review]]
tags:
  - table
  - database
---

# youtube_quality_checks

> [!info] Purpose
> The last automated gate.

## Key columns

`video_id`, `verdict`, `issues[]`, `summary`, `measured`

## Relationships

Child of a video.

## Indexes

—

## Row Level Security

**business-scoped** — see [[Row Level Security]].

## Used by

[[Quality Control]], [[Studio Review]]

## Migration history

`0002`

## Related

- [[Quality Control]]
- [[Studio Review]]
